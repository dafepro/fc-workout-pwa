package canvasphysics

import (
	"strings"
	"testing"
)

func TestCheckpointCodecRoundTripsVersionOne(t *testing.T) {
	checkpoint := Checkpoint{
		Version:  1,
		SceneID:  "top-down-field",
		Sequence: 42,
		Bodies: []BodyState{{
			ID: "ball", AssetID: "soccer", Position: Vector{X: 40, Y: 50},
			Velocity: Vector{X: 3, Y: -2}, Size: 44, ResetCount: 1,
		}},
	}

	encoded, err := EncodeCheckpoint(checkpoint)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := DecodeCheckpoint(encoded)
	if err != nil {
		t.Fatal(err)
	}
	if decoded.Version != 1 || decoded.Sequence != 42 || len(decoded.Bodies) != 1 || decoded.Bodies[0].Velocity.X != 3 {
		t.Fatalf("decoded checkpoint = %+v", decoded)
	}
}

func TestCheckpointCodecRejectsUnknownVersionsFieldsAndInvalidNumbers(t *testing.T) {
	for _, payload := range []string{
		`{"v":2,"sceneId":"space","sequence":1,"bodies":[]}`,
		`{"v":1,"sceneId":"space","sequence":1,"bodies":[],"script":"run"}`,
		`{"v":1,"sceneId":"space","sequence":1,"bodies":[{"id":"ball","assetId":"soccer","position":{"x":999,"y":50},"velocity":{"x":0,"y":0},"size":44,"angle":0,"angularVelocity":0,"sleeping":false,"resetCount":0}]}`,
		strings.Repeat("x", maxCheckpointBytes+1),
	} {
		if _, err := DecodeCheckpoint([]byte(payload)); err == nil {
			t.Fatalf("accepted invalid checkpoint: %.80q", payload)
		}
	}
}

func TestSplitCheckpointRecordsRoundTripStrictly(t *testing.T) {
	scene := SceneState{Version: 1, SceneID: "space", Sequence: 9}
	body := BodyState{
		ID: "rocket", AssetID: "rocket", Position: Vector{X: 45, Y: 55},
		Velocity: Vector{X: 4, Y: 2}, Size: 50,
	}
	sceneJSON, err := EncodeSceneState(scene)
	if err != nil {
		t.Fatal(err)
	}
	bodyJSON, err := EncodeBodyState(body)
	if err != nil {
		t.Fatal(err)
	}
	decodedScene, err := DecodeSceneState(sceneJSON)
	if err != nil {
		t.Fatal(err)
	}
	decodedBody, err := DecodeBodyState(bodyJSON)
	if err != nil {
		t.Fatal(err)
	}
	if decodedScene != scene || decodedBody.ID != body.ID || decodedBody.Velocity != body.Velocity {
		t.Fatalf("scene=%+v body=%+v", decodedScene, decodedBody)
	}
	if _, err := DecodeBodyState([]byte(`{"id":"ball","assetId":"soccer","position":{"x":50,"y":50},"velocity":{"x":0,"y":0},"size":44,"angle":0,"angularVelocity":0,"sleeping":false,"resetCount":0,"mass":999}`)); err == nil {
		t.Fatal("body codec accepted a client-authored capability")
	}
}

func TestCatalogLeavesOrdinaryStampsNonColliding(t *testing.T) {
	for _, assetID := range []string{"fire", "shield", "star", "spark-cleat"} {
		if _, ok := NewCatalogBody("piece", assetID, Transform{X: 50, Y: 50, Size: 44}); ok {
			t.Fatalf("%s unexpectedly became a physics body", assetID)
		}
	}
	for _, assetID := range []string{"soccer", "balloon", "rocket"} {
		if _, ok := NewCatalogBody("piece", assetID, Transform{X: 50, Y: 50, Size: 44}); !ok {
			t.Fatalf("%s must be a reviewed dynamic body", assetID)
		}
	}
}
