//go:build dev

package config

import "testing"

func TestDevTaggedBuildAcceptsCompleteDevConfiguration(t *testing.T) {
	values := map[string]string{
		"APP_ENV":               "dev",
		"ENABLE_DEV_ACCESS":     "true",
		"DEV_API_GATEWAY_TOKEN": "01234567890123456789012345678901",
		"DEV_RESET_KEY":         "abcdefghijklmnopqrstuvwxyz123456",
		"DEV_FIXTURE_SEED":      "fixture-seed-with-at-least-32-bytes",
		"DEV_ADMIN_PASSWORD":    "well-known-preview-pass",
	}
	cfg, err := Load(func(key string) string { return values[key] })
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if !cfg.EnableDevAccess || cfg.DevAdminPassword == "" || cfg.DevFixtureSeed == "" {
		t.Fatalf("dev configuration missing: %+v", cfg)
	}
}
