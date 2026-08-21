package canvasphysics

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
)

const maxCheckpointBytes = 64 * 1024

const MaxBodies = 64

type Vector struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type Transform struct {
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Size     float64 `json:"size"`
	Rotation float64 `json:"rotation"`
}

type BodyState struct {
	ID              string  `json:"id"`
	AssetID         string  `json:"assetId"`
	Position        Vector  `json:"position"`
	Velocity        Vector  `json:"velocity"`
	Size            float64 `json:"size"`
	Angle           float64 `json:"angle"`
	AngularVelocity float64 `json:"angularVelocity"`
	Sleeping        bool    `json:"sleeping"`
	Recovering      bool    `json:"recovering"`
	ResetCount      int     `json:"resetCount"`
}

type Checkpoint struct {
	Version  int         `json:"v"`
	SceneID  string      `json:"sceneId"`
	Sequence uint64      `json:"sequence"`
	Bodies   []BodyState `json:"bodies"`
}

type SceneState struct {
	Version  int    `json:"v"`
	SceneID  string `json:"sceneId"`
	Sequence uint64 `json:"sequence"`
}

func EncodeSceneState(state SceneState) ([]byte, error) {
	if state.Version != 1 {
		return nil, errors.New("unsupported physics checkpoint version")
	}
	if _, ok := SceneByID(state.SceneID); !ok {
		return nil, errors.New("unknown physics scene")
	}
	return json.Marshal(state)
}

func DecodeSceneState(encoded []byte) (SceneState, error) {
	var state SceneState
	if err := decodeStrict(encoded, &state); err != nil {
		return SceneState{}, fmt.Errorf("decode physics scene: %w", err)
	}
	if state.Version != 1 {
		return SceneState{}, errors.New("unsupported physics checkpoint version")
	}
	if _, ok := SceneByID(state.SceneID); !ok {
		return SceneState{}, errors.New("unknown physics scene")
	}
	return state, nil
}

func EncodeBodyState(state BodyState) ([]byte, error) {
	if err := validateBodyState(state); err != nil {
		return nil, err
	}
	return json.Marshal(state)
}

func DecodeBodyState(encoded []byte) (BodyState, error) {
	var state BodyState
	if err := decodeStrict(encoded, &state); err != nil {
		return BodyState{}, fmt.Errorf("decode physics body: %w", err)
	}
	if err := validateBodyState(state); err != nil {
		return BodyState{}, err
	}
	return state, nil
}

func EncodeCheckpoint(checkpoint Checkpoint) ([]byte, error) {
	if err := validateCheckpoint(checkpoint); err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(checkpoint)
	if err != nil {
		return nil, fmt.Errorf("encode physics checkpoint: %w", err)
	}
	if len(encoded) > maxCheckpointBytes {
		return nil, errors.New("physics checkpoint is too large")
	}
	return encoded, nil
}

func DecodeCheckpoint(encoded []byte) (Checkpoint, error) {
	if len(encoded) == 0 || len(encoded) > maxCheckpointBytes {
		return Checkpoint{}, errors.New("physics checkpoint has an invalid size")
	}
	decoder := json.NewDecoder(bytes.NewReader(encoded))
	decoder.DisallowUnknownFields()
	var checkpoint Checkpoint
	if err := decoder.Decode(&checkpoint); err != nil {
		return Checkpoint{}, fmt.Errorf("decode physics checkpoint: %w", err)
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return Checkpoint{}, errors.New("physics checkpoint has trailing data")
	}
	if err := validateCheckpoint(checkpoint); err != nil {
		return Checkpoint{}, err
	}
	return checkpoint, nil
}

func validateCheckpoint(checkpoint Checkpoint) error {
	if checkpoint.Version != 1 {
		return errors.New("unsupported physics checkpoint version")
	}
	if _, ok := SceneByID(checkpoint.SceneID); !ok {
		return errors.New("unknown physics scene")
	}
	if len(checkpoint.Bodies) > MaxBodies {
		return errors.New("physics checkpoint has too many bodies")
	}
	seen := make(map[string]bool, len(checkpoint.Bodies))
	for _, body := range checkpoint.Bodies {
		if body.ID == "" || len(body.ID) > 128 || seen[body.ID] {
			return errors.New("physics checkpoint has an invalid body id")
		}
		seen[body.ID] = true
		if _, ok := BehaviorFor(body.AssetID); !ok {
			return errors.New("physics checkpoint has an unknown behavior")
		}
		values := []float64{
			body.Position.X, body.Position.Y, body.Velocity.X, body.Velocity.Y,
			body.Size, body.Angle, body.AngularVelocity,
		}
		for _, value := range values {
			if !finite(value) {
				return errors.New("physics checkpoint contains a non-finite number")
			}
		}
		if body.Position.X < -20 || body.Position.X > 120 || body.Position.Y < -20 || body.Position.Y > 120 ||
			math.Abs(body.Velocity.X) > 200 || math.Abs(body.Velocity.Y) > 200 ||
			body.Size < 28 || body.Size > 76 || math.Abs(body.AngularVelocity) > 720 ||
			body.ResetCount < 0 || body.ResetCount > 1_000_000 {
			return errors.New("physics checkpoint contains an out-of-range body")
		}
	}
	return nil
}

func validateBodyState(body BodyState) error {
	checkpoint := Checkpoint{
		Version: 1, SceneID: "top-down-field", Bodies: []BodyState{body},
	}
	return validateCheckpoint(checkpoint)
}

func decodeStrict(encoded []byte, target any) error {
	if len(encoded) == 0 || len(encoded) > maxCheckpointBytes {
		return errors.New("physics checkpoint has an invalid size")
	}
	decoder := json.NewDecoder(bytes.NewReader(encoded))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return errors.New("physics checkpoint has trailing data")
	}
	return nil
}

func finite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}
