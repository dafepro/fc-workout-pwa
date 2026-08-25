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
	defaultRewardMediaDir  = "data/reward-media"
	// A squad's worth of players signing in never approaches these rates, while
	// they leave credential spraying far too slow to be useful.
	defaultLoginAttemptsPerMinute       = 30
	defaultGlobalLoginAttemptsPerMinute = 120
	// Separate from the player ceiling so a flood against the player endpoint
	// cannot spend the budget console sign-in needs.
	//
	// Not lower than the player ceiling, though staff is a handful of people
	// rather than a squad's worth of parents. A global bucket is a backstop
	// against a spray spread over too many addresses for the per-address limit
	// to see, and it is shared-fate by construction: whoever empties it locks
	// out everyone on that path. The staff endpoints answer on the public API
	// hostname, not behind the console's edge gate, so sizing this to real
	// staff volume would have handed an attacker a coach lockout for 30
	// requests a minute.
	defaultStaffGlobalLoginAttemptsPerMinute = 120
)

type Config struct {
	Environment        string
	Port               int
	DatabaseURL        string
	RewardMediaDir     string
	RewardMailerMode   string
	RewardEmailFrom    string
	RewardEmailBaseURL string
	ResendAPIKey       string
	AllowedOrigin      string
	TeamTimeZone       *time.Location
	TeamTimeZoneID     string
	ShutdownTimeout    time.Duration
	EnableE2EFixtures  bool
	E2EResetKey        string
	EnableDevAccess    bool
	DevAPIGatewayToken string
	DevResetKey        string
	DevFixtureSeed     string
	DevAdminPassword   string
	// Zero disables the corresponding login throttle.
	LoginAttemptsPerMinute            int
	GlobalLoginAttemptsPerMinute      int
	StaffGlobalLoginAttemptsPerMinute int
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
		Environment:        valueOrDefault(getenv("APP_ENV"), "development"),
		DatabaseURL:        valueOrDefault(getenv("DATABASE_URL"), defaultDatabaseURL),
		RewardMediaDir:     valueOrDefault(strings.TrimSpace(getenv("REWARD_MEDIA_DIR")), defaultRewardMediaDir),
		RewardMailerMode:   valueOrDefault(strings.TrimSpace(getenv("REWARD_MAILER_MODE")), "sink"),
		RewardEmailFrom:    valueOrDefault(strings.TrimSpace(getenv("REWARD_EMAIL_FROM")), "ZoomiGo Rewards <rewards@example.invalid>"),
		RewardEmailBaseURL: valueOrDefault(strings.TrimSpace(getenv("REWARD_EMAIL_BASE_URL")), "http://localhost:3000"),
		ResendAPIKey:       strings.TrimSpace(getenv("RESEND_API_KEY")),
		AllowedOrigin:      valueOrDefault(getenv("ALLOWED_ORIGIN"), "http://localhost:3000"),
		TeamTimeZoneID:     valueOrDefault(getenv("TEAM_TIME_ZONE"), defaultTeamTimeZone),
		ShutdownTimeout:    defaultShutdownTimeout,
		E2EResetKey:        getenv("E2E_RESET_KEY"),
		DevAPIGatewayToken: strings.TrimSpace(getenv("DEV_API_GATEWAY_TOKEN")),
		DevResetKey:        strings.TrimSpace(getenv("DEV_RESET_KEY")),
		DevFixtureSeed:     strings.TrimSpace(getenv("DEV_FIXTURE_SEED")),
		DevAdminPassword:   getenv("DEV_ADMIN_PASSWORD"),
		PlayerLoginURL:     strings.TrimSpace(getenv("PLAYER_LOGIN_URL")),
		StaffSetupURL:      strings.TrimSpace(getenv("STAFF_SETUP_URL")),
	}
	cfg.ProductionDataApproved = getenv("PRODUCTION_DATA_APPROVED") == "true"
	if cfg.RewardMailerMode != "sink" && cfg.RewardMailerMode != "resend" {
		return Config{}, fmt.Errorf("REWARD_MAILER_MODE must be sink or resend")
	}
	if cfg.RewardMailerMode == "resend" && (cfg.ResendAPIKey == "" || !strings.HasPrefix(cfg.RewardEmailBaseURL, "https://")) {
		return Config{}, fmt.Errorf("resend reward mail requires RESEND_API_KEY and an https REWARD_EMAIL_BASE_URL")
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
	if raw := getenv("ENABLE_DEV_ACCESS"); raw != "" {
		enabled, err := strconv.ParseBool(raw)
		if err != nil {
			return Config{}, fmt.Errorf("ENABLE_DEV_ACCESS must be true or false")
		}
		cfg.EnableDevAccess = enabled
	}
	if cfg.EnableDevAccess {
		if cfg.Environment != "dev" || !devBuildEnabled {
			return Config{}, fmt.Errorf("dev access requires APP_ENV=dev and a dev-tagged build")
		}
		if len(cfg.DevAPIGatewayToken) < 32 {
			return Config{}, fmt.Errorf("DEV_API_GATEWAY_TOKEN must be at least 32 characters when dev access is enabled")
		}
		if len(cfg.DevResetKey) < 32 {
			return Config{}, fmt.Errorf("DEV_RESET_KEY must be at least 32 characters when dev access is enabled")
		}
		if len(cfg.DevFixtureSeed) < 32 {
			return Config{}, fmt.Errorf("DEV_FIXTURE_SEED must be at least 32 characters when dev access is enabled")
		}
		if len(cfg.DevAdminPassword) < 12 {
			return Config{}, fmt.Errorf("DEV_ADMIN_PASSWORD must be at least 12 characters when dev access is enabled")
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
	cfg.StaffGlobalLoginAttemptsPerMinute, err = attemptRate(getenv, "STAFF_GLOBAL_LOGIN_ATTEMPTS_PER_MINUTE", defaultStaffGlobalLoginAttemptsPerMinute)
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
