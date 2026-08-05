package config

import (
	"testing"
	"time"
)

func TestLoadDefaults(t *testing.T) {
	cfg, err := Load(func(string) string { return "" })
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.Port != 8080 {
		t.Fatalf("Port = %d, want 8080", cfg.Port)
	}
	if cfg.TeamTimeZoneID != "America/Chicago" {
		t.Fatalf("TeamTimeZoneID = %q", cfg.TeamTimeZoneID)
	}
	if cfg.ShutdownTimeout != 10*time.Second {
		t.Fatalf("ShutdownTimeout = %s", cfg.ShutdownTimeout)
	}
}

func TestLoadRejectsInvalidValues(t *testing.T) {
	tests := []map[string]string{
		{"PORT": "0"},
		{"PORT": "not-a-port"},
		{"SHUTDOWN_TIMEOUT": "0s"},
		{"TEAM_TIME_ZONE": "Not/AZone"},
		{"ENABLE_E2E_FIXTURES": "sometimes"},
		{"ENABLE_E2E_FIXTURES": "true", "APP_ENV": "production", "E2E_RESET_KEY": "not-empty"},
	}
	for _, values := range tests {
		_, err := Load(func(key string) string { return values[key] })
		if err == nil {
			t.Fatalf("Load(%v) expected an error", values)
		}
	}
}
