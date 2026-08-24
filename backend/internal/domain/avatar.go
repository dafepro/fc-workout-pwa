package domain

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
)

const (
	maxAvatarLayers    = 15
	maxAvatarJSONBytes = 512
)

var (
	ErrInvalidAvatarConfiguration = errors.New("avatar configuration is not well formed")
	avatarSlug                    = regexp.MustCompile(`^[a-z0-9-]{1,24}$`)
	avatarHexColor                = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)
	avatarPalette                 = regexp.MustCompile(`^#[0-9a-fA-F]{6}:#[0-9a-fA-F]{6}$`)
	avatarLayerKey                = regexp.MustCompile(`^[a-z][A-Za-z0-9]{0,23}$`)
)

// NormalizeAvatarConfiguration checks shape rather than membership, and returns
// the canonical JSON to store. The option catalog lives in the client, so a
// well-formed slug this build has never heard of is still stored: a client that
// cannot resolve it renders a default part instead, which keeps a player's
// saved look from being destroyed by a release that ships the catalog and the
// server out of step. What the server does guarantee is that the column holds a
// small, flat, marshalable object of safe tokens.
func NormalizeAvatarConfiguration(raw map[string]string) (string, error) {
	if len(raw) > maxAvatarLayers {
		return "", fmt.Errorf("%w: at most %d layers", ErrInvalidAvatarConfiguration, maxAvatarLayers)
	}
	// Marshaling a nil map yields "null", and the column has to stay an object.
	layers := make(map[string]string, len(raw))
	for key, value := range raw {
		if !avatarLayerKey.MatchString(key) {
			return "", fmt.Errorf("%w: layer name %q", ErrInvalidAvatarConfiguration, key)
		}
		if !avatarSlug.MatchString(value) && !avatarHexColor.MatchString(value) && !avatarPalette.MatchString(value) {
			return "", fmt.Errorf("%w: layer %q option", ErrInvalidAvatarConfiguration, key)
		}
		layers[key] = value
	}
	encoded, err := json.Marshal(layers)
	if err != nil {
		return "", fmt.Errorf("%w: %s", ErrInvalidAvatarConfiguration, err)
	}
	if len(encoded) > maxAvatarJSONBytes {
		return "", fmt.Errorf("%w: at most %d bytes", ErrInvalidAvatarConfiguration, maxAvatarJSONBytes)
	}
	return string(encoded), nil
}
