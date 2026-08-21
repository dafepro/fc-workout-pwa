package canvasphysics

import (
	"hash/fnv"
	"math"
	"sort"
	"time"
)

const FixedStep = time.Second / 30

const (
	canonicalBoardWidth = 400.0
	avatarRadius        = 4.2
	maximumAvatarSpeed  = 85.0
	sleepSpeed          = 0.08
	sleepSteps          = 45
	boundaryRestSpeed   = 1.05
	bodySolverSteps     = 4
	avatarContactSlop   = 0.8
)

type Body struct {
	BodyState
	behavior   Behavior
	idleSteps  int
	kinematic  bool
	ghostSteps int
}

type avatarSample struct {
	position Vector
	target   Vector
	velocity Vector
	at       time.Time
}

type World struct {
	Scene     SceneProfile
	Sequence  uint64
	bodies    map[string]Body
	avatars   map[string]avatarSample
	contacts  map[string]bool
	lastReset []string
}

func NewWorld(scene SceneProfile) *World {
	return &World{
		Scene: scene, bodies: make(map[string]Body), avatars: make(map[string]avatarSample),
		contacts: make(map[string]bool),
	}
}

func NewCatalogBody(id, assetID string, transform Transform) (Body, bool) {
	behavior, ok := BehaviorFor(assetID)
	if !ok {
		return Body{}, false
	}
	return Body{
		BodyState: BodyState{
			ID: id, AssetID: assetID, Position: Vector{X: transform.X, Y: transform.Y},
			Size: transform.Size, Angle: transform.Rotation,
		},
		behavior: behavior,
	}, true
}

func BodyFromState(state BodyState) (Body, bool) {
	body, ok := NewCatalogBody(state.ID, state.AssetID, Transform{
		X: state.Position.X, Y: state.Position.Y, Size: state.Size, Rotation: state.Angle,
	})
	if !ok {
		return Body{}, false
	}
	body.BodyState = state
	if state.Recovering {
		body.ghostSteps = 30
	}
	return body, true
}

func (body Body) Radius() float64 {
	return (body.Size / canonicalBoardWidth * 100 / 2) * body.behavior.RadiusScale
}

func (body Body) MaxSpeed() float64 {
	return body.behavior.MaximumSpeed
}

func (body Body) Speed() float64 {
	return length(body.Velocity)
}

func (world *World) Upsert(body Body) {
	if behavior, ok := BehaviorFor(body.AssetID); ok {
		body.behavior = behavior
		world.bodies[body.ID] = body
	}
}

func (world *World) Remove(id string) {
	delete(world.bodies, id)
}

func (world *World) SetKinematic(id string, kinematic bool) {
	body, ok := world.bodies[id]
	if !ok {
		return
	}
	body.kinematic = kinematic
	body.Velocity = Vector{}
	body.AngularVelocity = 0
	body.Sleeping = false
	body.idleSteps = 0
	world.bodies[id] = body
}

func (world *World) Body(id string) (Body, bool) {
	body, ok := world.bodies[id]
	return body, ok
}

func (world *World) Bodies() []BodyState {
	ids := world.bodyIDs()
	bodies := make([]BodyState, 0, len(ids))
	for _, id := range ids {
		bodies = append(bodies, world.bodies[id].BodyState)
	}
	return bodies
}

func (world *World) Checkpoint() Checkpoint {
	return Checkpoint{
		Version: 1, SceneID: world.Scene.ID, Sequence: world.Sequence, Bodies: world.Bodies(),
	}
}

func (world *World) HasAwakeBodies() bool {
	for _, body := range world.bodies {
		if !body.Sleeping {
			return true
		}
	}
	for _, avatar := range world.avatars {
		if avatar.position != avatar.target {
			return true
		}
	}
	return false
}

func (world *World) Resets() []string {
	return append([]string(nil), world.lastReset...)
}

func (world *World) AvatarPositions() map[string]Vector {
	positions := make(map[string]Vector, len(world.avatars))
	for playerID, sample := range world.avatars {
		positions[playerID] = sample.position
	}
	return positions
}

func (world *World) Step(step time.Duration) {
	seconds := step.Seconds()
	if seconds <= 0 || seconds > 0.1 {
		return
	}
	world.lastReset = world.lastReset[:0]
	for _, id := range world.bodyIDs() {
		body := world.bodies[id]
		if world.bodyInvalid(body) {
			world.resetBody(&body)
			world.bodies[id] = body
			continue
		}
		if body.Recovering {
			position, clear := world.safeSpawn(body.ID, body.ResetCount, body.Radius())
			body.Position = position
			if clear {
				body.Recovering = false
				body.ghostSteps = 0
			} else {
				body.ghostSteps--
				if body.ghostSteps <= 0 {
					body.ResetCount++
					body.ghostSteps = 30
					world.lastReset = append(world.lastReset, body.ID)
				}
			}
			world.bodies[id] = body
			continue
		}
		if body.kinematic || body.Recovering {
			continue
		}
		if body.Sleeping {
			continue
		}
		body.Velocity.X += world.Scene.Gravity.X * body.behavior.GravityScale * seconds
		body.Velocity.Y += world.Scene.Gravity.Y * body.behavior.GravityScale * seconds
		damping := world.Scene.LinearDamping + body.behavior.LinearDamping
		factor := math.Exp(-damping * seconds)
		body.Velocity.X *= factor
		body.Velocity.Y *= factor
		body.AngularVelocity *= factor
		clampBodySpeed(&body)
		body.Position.X += body.Velocity.X * seconds
		body.Position.Y += body.Velocity.Y * seconds
		body.Angle = normalizedAngle(body.Angle + body.AngularVelocity*seconds)
		world.resolveBounds(&body)
		world.bodies[id] = body
	}
	world.advanceAvatars(seconds)
	world.resolveBodyCollisions()
	for _, id := range world.bodyIDs() {
		body := world.bodies[id]
		if body.kinematic || body.Recovering {
			continue
		}
		if body.Speed() < sleepSpeed && math.Abs(body.AngularVelocity) < 0.2 {
			body.idleSteps++
			if body.idleSteps >= sleepSteps {
				body.Sleeping = true
				body.Velocity = Vector{}
				body.AngularVelocity = 0
			}
		} else {
			body.idleSteps = 0
		}
		world.bodies[id] = body
	}
	world.Sequence++
}

func (world *World) MoveAvatar(playerID string, position Vector, at time.Time) {
	if !finite(position.X) || !finite(position.Y) {
		return
	}
	previous, exists := world.avatars[playerID]
	if !exists {
		world.avatars[playerID] = avatarSample{position: position, target: position, at: at}
		return
	}
	if !at.After(previous.at) {
		return
	}
	delta := subtract(position, previous.position)
	duration := at.Sub(previous.at).Seconds()
	if duration > 0.5 {
		duration = 0.5
	}
	velocity := scale(delta, 1/math.Max(duration, 0.04))
	velocity = clampVector(velocity, maximumAvatarSpeed)
	if length(delta) < 0.001 {
		velocity = Vector{}
	}
	previous.target = position
	previous.velocity = velocity
	previous.at = at
	world.avatars[playerID] = previous
}

func (world *World) advanceAvatars(seconds float64) {
	nextContacts := make(map[string]bool)
	playerIDs := make([]string, 0, len(world.avatars))
	for playerID := range world.avatars {
		playerIDs = append(playerIDs, playerID)
	}
	sort.Strings(playerIDs)
	for _, playerID := range playerIDs {
		avatar := world.avatars[playerID]
		start := avatar.position
		motionVelocity := avatar.velocity
		remaining := subtract(avatar.target, start)
		movement := scale(motionVelocity, seconds)
		if length(remaining) < 0.001 || dot(movement, remaining) <= 0 || length(movement) >= length(remaining) {
			avatar.position = avatar.target
			avatar.velocity = Vector{}
		} else {
			avatar.position = add(start, movement)
		}
		world.resolveAvatarContacts(playerID, start, avatar.position, motionVelocity, nextContacts)
		world.avatars[playerID] = avatar
	}
	world.contacts = nextContacts
}

func (world *World) resolveAvatarContacts(
	playerID string,
	start, end, avatarVelocity Vector,
	nextContacts map[string]bool,
) {
	for _, bodyID := range world.bodyIDs() {
		body := world.bodies[bodyID]
		if body.kinematic || body.Recovering {
			continue
		}
		minimumDistance := body.Radius() + avatarRadius
		closest := closestPointOnSegment(body.Position, start, end)
		contactDistance := distance(body.Position, closest)
		key := playerID + "\x00" + bodyID
		if contactDistance > minimumDistance+avatarContactSlop {
			continue
		}
		if contactDistance > minimumDistance {
			if world.contacts[key] {
				nextContacts[key] = true
			}
			continue
		}
		nextContacts[key] = true

		normal := normalized(subtract(body.Position, closest))
		if length(normal) < 0.001 {
			normal = normalized(avatarVelocity)
		}
		if length(normal) < 0.001 {
			normal = Vector{X: 1}
		}
		endDelta := subtract(body.Position, end)
		endDistance := length(endDelta)
		if endDistance < minimumDistance {
			separationNormal := normalized(endDelta)
			if length(separationNormal) < 0.001 {
				separationNormal = normal
			}
			body.Position = add(body.Position, scale(separationNormal, minimumDistance-endDistance+0.001))
			world.resolveBounds(&body)
			normal = separationNormal
		}

		if !world.contacts[key] {
			approachSpeed := dot(subtract(avatarVelocity, body.Velocity), normal)
			if approachSpeed > 1 {
				desiredSpeed := math.Min(
					body.MaxSpeed()*0.92,
					math.Max(body.MaxSpeed()*0.55, approachSpeed*(1+body.behavior.Restitution)),
				)
				currentSpeed := dot(body.Velocity, normal)
				if desiredSpeed > currentSpeed {
					body.Velocity = add(body.Velocity, scale(normal, desiredSpeed-currentSpeed))
				}
				body.AngularVelocity += (normal.X + normal.Y) * 64 / math.Max(body.behavior.Mass, 0.1)
			}
		}
		body.Sleeping = false
		body.idleSteps = 0
		clampBodySpeed(&body)
		world.bodies[bodyID] = body
	}
}

func (world *World) bodyInvalid(body Body) bool {
	values := []float64{
		body.Position.X, body.Position.Y, body.Velocity.X, body.Velocity.Y,
		body.Angle, body.AngularVelocity, body.Size,
	}
	for _, value := range values {
		if !finite(value) {
			return true
		}
	}
	return math.Abs(body.Position.X) > 200 || math.Abs(body.Position.Y) > 200 || body.Speed() > body.MaxSpeed()*20
}

func (world *World) resetBody(body *Body) {
	body.ResetCount++
	body.Velocity = Vector{}
	body.AngularVelocity = 0
	body.Angle = 0
	body.Sleeping = false
	body.Recovering = false
	body.idleSteps = 0
	position, clear := world.safeSpawn(body.ID, body.ResetCount, body.Radius())
	body.Position = position
	if !clear {
		body.Recovering = true
		body.ghostSteps = 30
	}
	world.lastReset = append(world.lastReset, body.ID)
}

func (world *World) safeSpawn(id string, resetCount int, radius float64) (Vector, bool) {
	hash := fnv.New32a()
	_, _ = hash.Write([]byte(id))
	seed := float64((hash.Sum32()+uint32(resetCount*2654435761))%360) * math.Pi / 180
	best := Vector{X: 50, Y: 50}
	bestClearance := math.Inf(-1)
	for attempt := 0; attempt < 72; attempt++ {
		ring := float64(attempt/8) * 6
		angle := seed + float64(attempt%8)*math.Pi/4
		candidate := Vector{X: 50 + math.Cos(angle)*ring, Y: 50 + math.Sin(angle)*ring}
		minimum := math.Max(radius, 6)
		maximum := math.Min(100-radius, 94)
		if candidate.X < minimum || candidate.X > maximum || candidate.Y < minimum || candidate.Y > maximum {
			continue
		}
		clear := true
		clearance := math.Inf(1)
		for _, other := range world.bodies {
			if other.ID != id && !other.Recovering {
				gap := distance(candidate, other.Position) - radius - other.Radius()
				clearance = math.Min(clearance, gap)
				if gap < 0.5 {
					clear = false
				}
			}
		}
		if clearance > bestClearance {
			best, bestClearance = candidate, clearance
		}
		if clear {
			return candidate, true
		}
	}
	return best, false
}

func (world *World) resolveBounds(body *Body) {
	radius := body.Radius()
	minimum := math.Max(radius, 6)
	maximum := math.Min(100-radius, 94)
	restitution := math.Min(body.behavior.Restitution, world.Scene.BoundaryRestitution)
	if body.Position.X < minimum {
		body.Position.X = minimum
		if body.Velocity.X < 0 {
			body.Velocity.X = bouncedVelocity(body.Velocity.X, restitution)
		}
	}
	if body.Position.X > maximum {
		body.Position.X = maximum
		if body.Velocity.X > 0 {
			body.Velocity.X = bouncedVelocity(body.Velocity.X, restitution)
		}
	}
	if body.Position.Y < minimum {
		body.Position.Y = minimum
		if body.Velocity.Y < 0 {
			body.Velocity.Y = bouncedVelocity(body.Velocity.Y, restitution)
		}
	}
	if body.Position.Y > maximum {
		body.Position.Y = maximum
		if body.Velocity.Y > 0 {
			body.Velocity.Y = bouncedVelocity(body.Velocity.Y, restitution)
		}
	}
}

func bouncedVelocity(velocity, restitution float64) float64 {
	if math.Abs(velocity) < boundaryRestSpeed {
		return 0
	}
	return -velocity * restitution
}

func (world *World) resolveBodyCollisions() {
	ids := world.bodyIDs()
	for iteration := 0; iteration < bodySolverSteps; iteration++ {
		for firstIndex, firstID := range ids {
			for _, secondID := range ids[firstIndex+1:] {
				first := world.bodies[firstID]
				second := world.bodies[secondID]
				if (first.kinematic && second.kinematic) || first.Recovering || second.Recovering {
					continue
				}
				delta := subtract(second.Position, first.Position)
				distanceBetween := length(delta)
				minimumDistance := first.Radius() + second.Radius()
				if distanceBetween >= minimumDistance {
					continue
				}
				normal := Vector{X: 1}
				if distanceBetween > 0.0001 {
					normal = scale(delta, 1/distanceBetween)
				}
				inverseFirst := inverseMass(first)
				inverseSecond := inverseMass(second)
				correction := scale(normal, (minimumDistance-distanceBetween+0.001)/(inverseFirst+inverseSecond))
				first.Position = subtract(first.Position, scale(correction, inverseFirst))
				second.Position = add(second.Position, scale(correction, inverseSecond))
				if !first.kinematic {
					world.resolveBounds(&first)
				}
				if !second.kinematic {
					world.resolveBounds(&second)
				}
				relativeVelocity := subtract(second.Velocity, first.Velocity)
				alongNormal := dot(relativeVelocity, normal)
				if alongNormal < 0 {
					restitution := math.Min(first.behavior.Restitution, second.behavior.Restitution)
					impulseMagnitude := -(1 + restitution) * alongNormal / (inverseFirst + inverseSecond)
					impulse := scale(normal, impulseMagnitude)
					first.Velocity = subtract(first.Velocity, scale(impulse, inverseFirst))
					second.Velocity = add(second.Velocity, scale(impulse, inverseSecond))
				}
				if !first.kinematic {
					first.Sleeping, first.idleSteps = false, 0
				}
				if !second.kinematic {
					second.Sleeping, second.idleSteps = false, 0
				}
				clampBodySpeed(&first)
				clampBodySpeed(&second)
				world.bodies[firstID], world.bodies[secondID] = first, second
			}
		}
	}
}

func inverseMass(body Body) float64 {
	if body.kinematic {
		return 0
	}
	return 1 / math.Max(body.behavior.Mass, 0.1)
}

func (world *World) bodyIDs() []string {
	ids := make([]string, 0, len(world.bodies))
	for id := range world.bodies {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}

func clampBodySpeed(body *Body) {
	body.Velocity = clampVector(body.Velocity, body.MaxSpeed())
	if body.AngularVelocity > 360 {
		body.AngularVelocity = 360
	}
	if body.AngularVelocity < -360 {
		body.AngularVelocity = -360
	}
}

func clampVector(vector Vector, maximum float64) Vector {
	speed := length(vector)
	if speed <= maximum || speed == 0 {
		return vector
	}
	return scale(vector, maximum/speed)
}

func closestPointOnSegment(point, start, end Vector) Vector {
	segment := subtract(end, start)
	lengthSquared := dot(segment, segment)
	if lengthSquared == 0 {
		return start
	}
	amount := math.Max(0, math.Min(1, dot(subtract(point, start), segment)/lengthSquared))
	return add(start, scale(segment, amount))
}

func normalized(vector Vector) Vector {
	size := length(vector)
	if size == 0 {
		return Vector{X: 1}
	}
	return scale(vector, 1/size)
}

func normalizedAngle(angle float64) float64 {
	normalized := math.Mod(angle+180, 360)
	if normalized < 0 {
		normalized += 360
	}
	return normalized - 180
}

func add(first, second Vector) Vector {
	return Vector{X: first.X + second.X, Y: first.Y + second.Y}
}

func subtract(first, second Vector) Vector {
	return Vector{X: first.X - second.X, Y: first.Y - second.Y}
}

func scale(vector Vector, amount float64) Vector {
	return Vector{X: vector.X * amount, Y: vector.Y * amount}
}

func dot(first, second Vector) float64 {
	return first.X*second.X + first.Y*second.Y
}

func length(vector Vector) float64 {
	return math.Hypot(vector.X, vector.Y)
}

func distance(first, second Vector) float64 {
	return length(subtract(first, second))
}
