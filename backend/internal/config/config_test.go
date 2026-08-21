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
	if cfg.LoginAttemptsPerMinute != defaultLoginAttemptsPerMinute {
		t.Fatalf("LoginAttemptsPerMinute = %d, want %d", cfg.LoginAttemptsPerMinute, defaultLoginAttemptsPerMinute)
	}
	if cfg.GlobalLoginAttemptsPerMinute != defaultGlobalLoginAttemptsPerMinute {
		t.Fatalf("GlobalLoginAttemptsPerMinute = %d, want %d", cfg.GlobalLoginAttemptsPerMinute, defaultGlobalLoginAttemptsPerMinute)
	}
}

// Zero disables throttling for local work, so only negatives and non-numbers are
// rejected.
func TestLoadAcceptsDisabledLoginThrottle(t *testing.T) {
	values := map[string]string{"LOGIN_ATTEMPTS_PER_MINUTE": "0", "GLOBAL_LOGIN_ATTEMPTS_PER_MINUTE": "0"}
	cfg, err := Load(func(key string) string { return values[key] })
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if cfg.LoginAttemptsPerMinute != 0 || cfg.GlobalLoginAttemptsPerMinute != 0 {
		t.Fatalf("login throttle was not disabled: %+v", cfg)
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
		{"ENABLE_DEV_ACCESS": "sometimes"},
		{"ENABLE_DEV_ACCESS": "true", "APP_ENV": "production", "DEV_API_GATEWAY_TOKEN": "not-empty"},
		{"LOGIN_ATTEMPTS_PER_MINUTE": "-1"},
		{"LOGIN_ATTEMPTS_PER_MINUTE": "plenty"},
		{"GLOBAL_LOGIN_ATTEMPTS_PER_MINUTE": "-1"},
	}
	for _, values := range tests {
		_, err := Load(func(key string) string { return values[key] })
		if err == nil {
			t.Fatalf("Load(%v) expected an error", values)
		}
	}
}

func TestLoadRejectsDevAccessWithoutGatewayToken(t *testing.T) {
	values := map[string]string{
		"APP_ENV":           "dev",
		"ENABLE_DEV_ACCESS": "true",
	}
	_, err := Load(func(key string) string { return values[key] })
	if err == nil {
		t.Fatal("Load() expected an error")
	}
}
