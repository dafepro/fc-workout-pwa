package canvasphysics

type SceneProfile struct {
	ID                  string
	Gravity             Vector
	LinearDamping       float64
	BoundaryRestitution float64
}

type Behavior struct {
	AssetID       string
	RadiusScale   float64
	Mass          float64
	Restitution   float64
	GravityScale  float64
	LinearDamping float64
	MaximumSpeed  float64
}

var behaviors = map[string]Behavior{
	"soccer": {
		AssetID: "soccer", RadiusScale: 0.92, Mass: 1,
		Restitution: 0.92, GravityScale: 1, LinearDamping: 0.04, MaximumSpeed: 52,
	},
	"balloon": {
		AssetID: "balloon", RadiusScale: 0.82, Mass: 0.45,
		Restitution: 0.55, GravityScale: -0.55, LinearDamping: 0.34, MaximumSpeed: 22,
	},
	"rocket": {
		AssetID: "rocket", RadiusScale: 0.84, Mass: 1.7,
		Restitution: 0.68, GravityScale: 0.35, LinearDamping: 0.04, MaximumSpeed: 38,
	},
}

var scenes = map[string]SceneProfile{
	"top-down-field": {
		ID: "top-down-field", LinearDamping: 0.34, BoundaryRestitution: 0.84,
	},
	"side-view": {
		ID: "side-view", Gravity: Vector{Y: 28}, LinearDamping: 0.1, BoundaryRestitution: 0.75,
	},
	"space": {
		ID: "space", LinearDamping: 0.035, BoundaryRestitution: 0.9,
	},
}

func SceneFor(backgroundAssetID string) SceneProfile {
	switch backgroundAssetID {
	case "creature-quest-town":
		return scenes["side-view"]
	case "cosmic-stadium":
		return scenes["space"]
	default:
		return scenes["top-down-field"]
	}
}

func SceneByID(sceneID string) (SceneProfile, bool) {
	scene, ok := scenes[sceneID]
	return scene, ok
}

func BehaviorFor(assetID string) (Behavior, bool) {
	behavior, ok := behaviors[assetID]
	return behavior, ok
}
