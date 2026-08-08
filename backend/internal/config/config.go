package config

import (
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"time"
	_ "time/tzdata"
)

const (
	defaultPort            = 8080
	defaultShutdownTimeout = 10 * time.Second
	defaultTeamTimeZone    = "America/Chicago"
	defaultDatabaseURL     = "file:data/zoomigo.db"
	// A squad's worth of players signing in never approaches these rates, while
	// they leave credential spraying far too slow to be useful.
	defaultLoginAttemptsPerMinute       = 30
	defaultGlobalLoginAttemptsPerMinute = 120
)

type Config struct {
	Environment       string
	Port              int
	DatabaseURL       string
	AllowedOrigin     string
	TeamTimeZone      *time.Location
	TeamTimeZoneID    string
	ShutdownTimeout   time.Duration
	EnableE2EFixtures bool
	E2EResetKey       string
	// Zero disables the corresponding login throttle.
	LoginAttemptsPerMinute       int
	GlobalLoginAttemptsPerMinute int
	// Absolute https URL the console builds a player's QR link from. Absent,
	// the console can still provision but cannot reveal a scannable code.
	PlayerLoginURL string
	// Absolute https URL of the console's setup page, used to build the
	// one-time staff setup link.
	StaffSetupURL string
	// Whether real player data may be created. The console honours this exactly
	// as the CLI does (SEC-7).
	ProductionDataApproved bool
	// Encrypts stored TOTP secrets. Absent, staff sign-in is refused rather
	// than run without a second factor, and the player app is unaffected.
	StaffSecretKey []byte
}

func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		Environment:     valueOrDefault(getenv("APP_ENV"), "development"),
		DatabaseURL:     valueOrDefault(getenv("DATABASE_URL"), defaultDatabaseURL),
		AllowedOrigin:   valueOrDefault(getenv("ALLOWED_ORIGIN"), "http://localhost:3000"),
		TeamTimeZoneID:  valueOrDefault(getenv("TEAM_TIME_ZONE"), defaultTeamTimeZone),
		ShutdownTimeout: defaultShutdownTimeout,
		E2EResetKey:     getenv("E2E_RESET_KEY"),
		PlayerLoginURL:  strings.TrimSpace(getenv("PLAYER_LOGIN_URL")),
		StaffSetupURL:   strings.TrimSpace(getenv("STAFF_SETUP_URL")),
	}
	cfg.ProductionDataApproved = getenv("PRODUCTION_DATA_APPROVED") == "true"

	if raw := getenv("ENABLE_E2E_FIXTURES"); raw != "" {
		enabled, err := strconv.ParseBool(raw)
		if err != nil {
			return Config{}, fmt.Errorf("ENABLE_E2E_FIXTURES must be true or false")
		}
		cfg.EnableE2EFixtures = enabled
	}
	if cfg.EnableE2EFixtures {
		if cfg.Environment != "e2e" || !e2eBuildEnabled {
			return Config{}, fmt.Errorf("E2E fixtures require APP_ENV=e2e and an e2e-tagged build")
		}
		if strings.TrimSpace(cfg.E2EResetKey) == "" {
			return Config{}, fmt.Errorf("E2E_RESET_KEY is required when E2E fixtures are enabled")
		}
	}

	portValue := valueOrDefault(getenv("PORT"), strconv.Itoa(defaultPort))
	port, err := strconv.Atoi(portValue)
	if err != nil || port < 1 || port > 65535 {
		return Config{}, fmt.Errorf("PORT must be an integer from 1 to 65535")
	}
	cfg.Port = port

	if timeoutValue := getenv("SHUTDOWN_TIMEOUT"); timeoutValue != "" {
		timeout, err := time.ParseDuration(timeoutValue)
		if err != nil || timeout <= 0 {
			return Config{}, fmt.Errorf("SHUTDOWN_TIMEOUT must be a positive Go duration")
		}
		cfg.ShutdownTimeout = timeout
	}

	cfg.LoginAttemptsPerMinute, err = attemptRate(getenv, "LOGIN_ATTEMPTS_PER_MINUTE", defaultLoginAttemptsPerMinute)
	if err != nil {
		return Config{}, err
	}
	cfg.GlobalLoginAttemptsPerMinute, err = attemptRate(getenv, "GLOBAL_LOGIN_ATTEMPTS_PER_MINUTE", defaultGlobalLoginAttemptsPerMinute)
	if err != nil {
		return Config{}, err
	}

	if raw := strings.TrimSpace(getenv("STAFF_SECRET_KEY")); raw != "" {
		key, decodeErr := base64.StdEncoding.DecodeString(raw)
		if decodeErr != nil || len(key) != 32 {
			return Config{}, fmt.Errorf("STAFF_SECRET_KEY must be 32 base64-encoded bytes")
		}
		cfg.StaffSecretKey = key
	}

	location, err := time.LoadLocation(cfg.TeamTimeZoneID)
	if err != nil {
		return Config{}, fmt.Errorf("TEAM_TIME_ZONE must be a valid IANA time zone: %w", err)
	}
	cfg.TeamTimeZone = location

	return cfg, nil
}

func attemptRate(getenv func(string) string, key string, fallback int) (int, error) {
	raw := getenv(key)
	if raw == "" {
		return fallback, nil
	}
	rate, err := strconv.Atoi(raw)
	if err != nil || rate < 0 {
		return 0, fmt.Errorf("%s must be a non-negative integer, where 0 disables the throttle", key)
	}
	return rate, nil
}

func valueOrDefault(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
