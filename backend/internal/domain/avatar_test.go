package domain_test

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

func TestNormalizeAvatarConfiguration(t *testing.T) {
	for _, testCase := range []struct {
		name  string
		raw   map[string]string
		want  string
		valid bool
	}{
		{name: "approved layers", raw: map[string]string{"head": "cheetah", "background": "sky", "eyewear": "none"}, want: `{"background":"sky","eyewear":"none","head":"cheetah"}`, valid: true},
		{name: "empty configuration keeps an object", raw: map[string]string{}, want: "{}", valid: true},
		{name: "nil configuration keeps an object", raw: nil, want: "{}", valid: true},
		{name: "unknown but well-formed slug is stored", raw: map[string]string{"head": "future-part"}, want: `{"head":"future-part"}`, valid: true},
		{name: "value with uppercase", raw: map[string]string{"head": "Cheetah"}},
		{name: "value with a space", raw: map[string]string{"head": "big cat"}},
		{name: "empty value", raw: map[string]string{"head": ""}},
		{name: "value over 24 characters", raw: map[string]string{"head": strings.Repeat("a", 25)}},
		{name: "key with a hyphen", raw: map[string]string{"head-part": "cheetah"}},
		{name: "key starting with a digit", raw: map[string]string{"1head": "cheetah"}},
		{name: "empty key", raw: map[string]string{"": "cheetah"}},
		{name: "too many layers", raw: manyAvatarLayers(13)},
		{name: "at the layer ceiling", raw: manyAvatarLayers(12), valid: true},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			stored, err := domain.NormalizeAvatarConfiguration(testCase.raw)
			if !testCase.valid {
				if !errors.Is(err, domain.ErrInvalidAvatarConfiguration) {
					t.Fatalf("error = %v, want ErrInvalidAvatarConfiguration", err)
				}
				return
			}
			if err != nil {
				t.Fatalf("normalize: %v", err)
			}
			if testCase.want != "" && stored != testCase.want {
				t.Fatalf("stored = %s, want %s", stored, testCase.want)
			}
			if !json.Valid([]byte(stored)) {
				t.Fatalf("stored value is not JSON: %s", stored)
			}
		})
	}
}

// The byte cap has to bite while every key, every value and the layer count are
// individually legal, so this uses the longest permitted key and value.
func TestNormalizeAvatarConfigurationRejectsAnOversizeDocument(t *testing.T) {
	raw := map[string]string{}
	for index := range 12 {
		raw[string(rune('a'+index))+strings.Repeat("q", 23)] = strings.Repeat("z", 24)
	}
	if _, err := domain.NormalizeAvatarConfiguration(raw); !errors.Is(err, domain.ErrInvalidAvatarConfiguration) {
		t.Fatalf("error = %v, want ErrInvalidAvatarConfiguration", err)
	}
}

// Decoding into map[string]string is the guard that rejects a body which is not
// a flat object of strings, so the shapes the handler must refuse are asserted
// against the decoder the handler uses.
func TestAvatarConfigurationDecodingRejectsNonFlatObjects(t *testing.T) {
	for _, body := range []string{
		`[]`,
		`"cheetah"`,
		`{"head":{"nested":"cheetah"}}`,
		`{"head":7}`,
		`{"head":true}`,
		`{"head":["cheetah"]}`,
	} {
		var configuration map[string]string
		if err := json.Unmarshal([]byte(body), &configuration); err == nil {
			t.Fatalf("%s decoded into a flat string map", body)
		}
	}
}

func manyAvatarLayers(count int) map[string]string {
	raw := make(map[string]string, count)
	for index := range count {
		raw[string(rune('a'+index))+"layer"] = "part"
	}
	return raw
}
