package config

import (
	"strings"
	"testing"
)

func TestTeamWorldRelayConfiguration(t *testing.T) {
	for _, tc := range []struct {
		name, key, url string
		valid          bool
	}{
		{"disabled", "", "", true},
		{"secure", strings.Repeat("k", 32), "wss://world.example.test/room", true},
		{"local", strings.Repeat("k", 32), "ws://127.0.0.1:8795/room", true},
		{"short key", "short", "wss://world.example.test/room", false},
		{"missing url", strings.Repeat("k", 32), "", false},
		{"insecure remote", strings.Repeat("k", 32), "ws://world.example.test/room", false},
		{"userinfo", strings.Repeat("k", 32), "wss://secret@world.example.test/room", false},
		{"query", strings.Repeat("k", 32), "wss://world.example.test/room?secret=x", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			_, err := Load(func(key string) string {
				switch key {
				case "TEAM_WORLD_RELAY_KEY":
					return tc.key
				case "TEAM_WORLD_RELAY_URL":
					return tc.url
				}
				return ""
			})
			if (err == nil) != tc.valid {
				t.Fatalf("valid=%v error=%v", tc.valid, err)
			}
		})
	}
}
