package canvasphysics

import (
	"fmt"
	"math"
	"testing"
	"time"
)

func TestTopDownFieldAppliesFrictionWithoutGravity(t *testing.T) {
	world := NewWorld(SceneFor("soccer-field"))
	body, ok := NewCatalogBody("ball", "soccer", Transform{X: 40, Y: 50, Size: 44})
	if !ok {
		t.Fatal("soccer must be a dynamic catalog body")
	}
	body.Velocity.X = 18
	world.Upsert(body)

	stepWorld(world, time.Second)
	got, _ := world.Body("ball")
	if got.Position.X <= 40 || got.Velocity.X <= 0 || got.Velocity.X >= 18 {
		t.Fatalf("top-down motion = %+v", got)
	}
	if got.Velocity.X < 11 {
		t.Fatalf("top-down field removed too much momentum: %+v", got)
	}
	if math.Abs(got.Position.Y-50) > 0.001 {
		t.Fatalf("top-down field added gravity: y=%v", got.Position.Y)
	}
}

func TestSideViewAppliesGravityAndBalloonBuoyancy(t *testing.T) {
	world := NewWorld(SceneFor("creature-quest-town"))
	ball, _ := NewCatalogBody("ball", "soccer", Transform{X: 40, Y: 30, Size: 44})
	balloon, _ := NewCatalogBody("balloon", "balloon", Transform{X: 60, Y: 60, Size: 44})
	world.Upsert(ball)
	world.Upsert(balloon)

	stepWorld(world, 500*time.Millisecond)
	fallen, _ := world.Body("ball")
	floated, _ := world.Body("balloon")
	if fallen.Position.Y <= 30 {
		t.Fatalf("ball did not fall: %+v", fallen)
	}
	if floated.Position.Y >= 60 {
		t.Fatalf("balloon did not float: %+v", floated)
	}
}

func TestSideViewBodiesSettleAtTheirGravityBoundary(t *testing.T) {
	world := NewWorld(SceneFor("creature-quest-town"))
	ball, _ := NewCatalogBody("ball", "soccer", Transform{X: 50, Y: 45, Size: 44})
	balloon, _ := NewCatalogBody("balloon", "balloon", Transform{X: 65, Y: 55, Size: 44})
	world.Upsert(ball)
	world.Upsert(balloon)

	stepWorld(world, 12*time.Second)
	ball, _ = world.Body("ball")
	balloon, _ = world.Body("balloon")
	if !ball.Sleeping || !balloon.Sleeping {
		t.Fatalf("gravity bodies never settled: ball=%+v balloon=%+v", ball, balloon)
	}
}

func TestSpaceCapsAndSlowlyDampsMotion(t *testing.T) {
	world := NewWorld(SceneFor("cosmic-stadium"))
	rocket, _ := NewCatalogBody("rocket", "rocket", Transform{X: 50, Y: 50, Size: 44})
	rocket.Velocity = Vector{X: 500, Y: 0}
	world.Upsert(rocket)

	world.Step(FixedStep)
	got, _ := world.Body("rocket")
	if got.Speed() > got.MaxSpeed()+0.001 {
		t.Fatalf("space speed was not capped: %v > %v", got.Speed(), got.MaxSpeed())
	}
	before := got.Speed()
	world.Step(FixedStep)
	got, _ = world.Body("rocket")
	if got.Speed() >= before {
		t.Fatalf("space motion did not damp: before=%v after=%v", before, got.Speed())
	}
}

func TestDynamicCirclesBounceWithoutOverlapping(t *testing.T) {
	world := NewWorld(SceneFor("cosmic-stadium"))
	left, _ := NewCatalogBody("left", "soccer", Transform{X: 45, Y: 50, Size: 44})
	right, _ := NewCatalogBody("right", "soccer", Transform{X: 55, Y: 50, Size: 44})
	left.Velocity.X = 10
	right.Velocity.X = -10
	world.Upsert(left)
	world.Upsert(right)

	stepWorld(world, 300*time.Millisecond)
	left, _ = world.Body("left")
	right, _ = world.Body("right")
	if left.Velocity.X >= 0 || right.Velocity.X <= 0 {
		t.Fatalf("circles did not bounce: left=%+v right=%+v", left, right)
	}
	if distance(left.Position, right.Position)+0.01 < left.Radius()+right.Radius() {
		t.Fatalf("circles remain overlapped: left=%+v right=%+v", left, right)
	}
}

func TestDynamicCirclesResolveFirmlyAndKeepAnEnergeticBounce(t *testing.T) {
	world := NewWorld(SceneFor("soccer-field"))
	left, _ := NewCatalogBody("left", "soccer", Transform{X: 46, Y: 50, Size: 44})
	right, _ := NewCatalogBody("right", "soccer", Transform{X: 54, Y: 50, Size: 44})
	left.Velocity.X = 12
	right.Velocity.X = -12
	world.Upsert(left)
	world.Upsert(right)

	world.Step(FixedStep)
	left, _ = world.Body("left")
	right, _ = world.Body("right")
	if distance(left.Position, right.Position)+0.02 < left.Radius()+right.Radius() {
		t.Fatalf("firm contact left bodies overlapped: left=%+v right=%+v", left, right)
	}
	if left.Velocity.X > -10 || right.Velocity.X < 10 {
		t.Fatalf("collision absorbed too much bounce: left=%+v right=%+v", left, right)
	}
}

func TestAvatarSweepImpartsCappedImpulse(t *testing.T) {
	world := NewWorld(SceneFor("soccer-field"))
	ball, _ := NewCatalogBody("ball", "soccer", Transform{X: 50, Y: 50, Size: 44})
	world.Upsert(ball)

	world.MoveAvatar("player", Vector{X: 35, Y: 50}, time.Unix(0, 0))
	world.MoveAvatar("player", Vector{X: 55, Y: 50}, time.Unix(0, int64(200*time.Millisecond)))
	got, _ := world.Body("ball")
	if got.Velocity.X <= 0 {
		t.Fatalf("avatar did not kick the ball: %+v", got)
	}
	if got.Speed() > got.MaxSpeed()+0.001 {
		t.Fatalf("avatar exceeded speed cap: %+v", got)
	}
	if got.Speed() < got.MaxSpeed()*0.8 {
		t.Fatalf("avatar contact felt like a shove instead of a kick: %+v", got)
	}
	avatar := world.AvatarPositions()["player"]
	if distance(got.Position, avatar)+0.02 < got.Radius()+avatarRadius {
		t.Fatalf("avatar remained embedded in the kicked ball: avatar=%+v ball=%+v", avatar, got)
	}
}

func TestKinematicPlacementIgnoresForcesAndCollisionsUntilReleased(t *testing.T) {
	world := NewWorld(SceneFor("creature-quest-town"))
	placed, _ := NewCatalogBody("placed", "soccer", Transform{X: 50, Y: 40, Size: 44})
	moving, _ := NewCatalogBody("moving", "soccer", Transform{X: 44, Y: 40, Size: 44})
	moving.Velocity.X = 12
	world.Upsert(placed)
	world.Upsert(moving)
	world.SetKinematic("placed", true)

	stepWorld(world, 300*time.Millisecond)
	placed, _ = world.Body("placed")
	if placed.Position != (Vector{X: 50, Y: 40}) || placed.Velocity != (Vector{}) {
		t.Fatalf("kinematic placement moved: %+v", placed)
	}
	moving, _ = world.Body("moving")
	if moving.Velocity.X >= 0 || distance(placed.Position, moving.Position)+0.02 < placed.Radius()+moving.Radius() {
		t.Fatalf("kinematic placement was not a solid collider: placed=%+v moving=%+v", placed, moving)
	}
	world.Remove("moving")
	world.SetKinematic("placed", false)
	world.Step(FixedStep)
	placed, _ = world.Body("placed")
	if placed.Position.Y <= 40 {
		t.Fatalf("released placement did not resume scene forces: %+v", placed)
	}
}

func TestAvatarPositionsExposeANonAliasedSnapshot(t *testing.T) {
	world := NewWorld(SceneFor("soccer-field"))
	world.MoveAvatar("player", Vector{X: 35, Y: 48}, time.Unix(0, 0))

	positions := world.AvatarPositions()
	positions["player"] = Vector{X: 99, Y: 99}

	if got := world.AvatarPositions()["player"]; got != (Vector{X: 35, Y: 48}) {
		t.Fatalf("avatar snapshot aliased world state: %+v", got)
	}
}

func TestInvalidBodyResetsDeterministicallyAndClearOfOtherBodies(t *testing.T) {
	world := NewWorld(SceneFor("soccer-field"))
	blocker, _ := NewCatalogBody("blocker", "soccer", Transform{X: 50, Y: 50, Size: 76})
	broken, _ := NewCatalogBody("broken", "soccer", Transform{X: 20, Y: 20, Size: 44})
	broken.Position.X = math.NaN()
	world.Upsert(blocker)
	world.Upsert(broken)

	world.Step(FixedStep)
	reset, _ := world.Body("broken")
	if !finite(reset.Position.X) || !finite(reset.Position.Y) || reset.ResetCount != 1 {
		t.Fatalf("invalid body did not reset: %+v", reset)
	}
	if distance(reset.Position, blocker.Position) < reset.Radius()+blocker.Radius() {
		t.Fatalf("reset body overlaps blocker: reset=%+v blocker=%+v", reset, blocker)
	}
	first := reset.Position
	reset.Position.X = math.Inf(1)
	world.Upsert(reset)
	world.Step(FixedStep)
	second, _ := world.Body("broken")
	if first == second.Position {
		t.Fatal("successive deterministic reset attempts should advance their seed")
	}
}

func TestCrowdedResetStaysGhostedUntilASafeOpeningExists(t *testing.T) {
	world := NewWorld(SceneFor("soccer-field"))
	index := 0
	for y := 8.0; y <= 92; y += 12 {
		for x := 8.0; x <= 92; x += 12 {
			blocker, _ := NewCatalogBody(
				fmt.Sprintf("blocker-%d", index),
				"soccer",
				Transform{X: x, Y: y, Size: 76},
			)
			world.Upsert(blocker)
			index++
		}
	}
	broken, _ := NewCatalogBody("broken", "soccer", Transform{X: 20, Y: 20, Size: 44})
	broken.Position.X = math.NaN()
	world.Upsert(broken)

	world.Step(FixedStep)
	reset, _ := world.Body("broken")
	if !reset.Recovering || !finite(reset.Position.X) || !finite(reset.Position.Y) {
		t.Fatalf("crowded reset was not safely ghosted: %+v", reset)
	}
	for id := range world.bodies {
		if id != "broken" {
			world.Remove(id)
		}
	}
	world.Step(FixedStep)
	reset, _ = world.Body("broken")
	if reset.Recovering {
		t.Fatalf("reset stayed ghosted after space opened: %+v", reset)
	}
}

func stepWorld(world *World, duration time.Duration) {
	for elapsed := time.Duration(0); elapsed < duration; elapsed += FixedStep {
		world.Step(FixedStep)
	}
}
