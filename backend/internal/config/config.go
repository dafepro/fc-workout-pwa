package config

import (
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
	defaultDatabaseURL     = "file:data/stridecrew.db"
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
}

func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		Environment:     valueOrDefault(getenv("APP_ENV"), "development"),
		DatabaseURL:     valueOrDefault(getenv("DATABASE_URL"), defaultDatabaseURL),
		AllowedOrigin:   valueOrDefault(getenv("ALLOWED_ORIGIN"), "http://localhost:3000"),
		TeamTimeZoneID:  valueOrDefault(getenv("TEAM_TIME_ZONE"), defaultTeamTimeZone),
		ShutdownTimeout: defaultShutdownTimeout,
		E2EResetKey:     getenv("E2E_RESET_KEY"),
	}

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

	location, err := time.LoadLocation(cfg.TeamTimeZoneID)
	if err != nil {
		return Config{}, fmt.Errorf("TEAM_TIME_ZONE must be a valid IANA time zone: %w", err)
	}
	cfg.TeamTimeZone = location

	return cfg, nil
}

func valueOrDefault(value, fallback string) string {
	if value == "" {
		return fallback
	}
	return value
}
