package config

import (
	"fmt"
	"strconv"
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
	Environment     string
	Port            int
	DatabaseURL     string
	AllowedOrigin   string
	TeamTimeZone    *time.Location
	TeamTimeZoneID  string
	ShutdownTimeout time.Duration
}

func Load(getenv func(string) string) (Config, error) {
	cfg := Config{
		Environment:     valueOrDefault(getenv("APP_ENV"), "development"),
		DatabaseURL:     valueOrDefault(getenv("DATABASE_URL"), defaultDatabaseURL),
		AllowedOrigin:   valueOrDefault(getenv("ALLOWED_ORIGIN"), "http://localhost:3000"),
		TeamTimeZoneID:  valueOrDefault(getenv("TEAM_TIME_ZONE"), defaultTeamTimeZone),
		ShutdownTimeout: defaultShutdownTimeout,
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
