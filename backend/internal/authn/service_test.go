package authn

import (
	"context"
	"encoding/base64"
	"errors"
	"testing"
	"time"
)

func TestResetE2ECredentialsIssuesEveryFixture(t *testing.T) {
	service, db := sessionService(t)
	now := time.Now().UTC().Format(time.RFC3339Nano)
	for _, statement := range []string{
		`INSERT INTO clubs (id, name, created_at) VALUES ('club-e2e', 'E2E', '` + now + `')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-mason', 'club-e2e', 'Mason', 'C', '{}', '` + now + `')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-ava', 'club-e2e', 'Ava', 'R', '{}', '` + now + `')`,
		`INSERT INTO accounts (id, club_id, player_id, role, status, created_at) VALUES ('account-mason', 'club-e2e', 'player-mason', 'player', 'active', '` + now + `')`,
		`INSERT INTO accounts (id, club_id, player_id, role, status, created_at) VALUES ('account-ava', 'club-e2e', 'player-ava', 'player', 'active', '` + now + `')`,
	} {
		if _, err := db.Exec(statement); err != nil {
			t.Fatal(err)
		}
	}

	err := service.ResetE2ECredentials(t.Context(),
		E2ECredential{AccountID: "account-mason", PIN: "2468", Token: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"},
		E2ECredential{AccountID: "account-ava", PIN: "1357", Token: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"},
	)
	if err != nil {
		t.Fatal(err)
	}
	var active int
	if err := db.QueryRow(`SELECT COUNT(*) FROM auth_credentials WHERE revoked_at IS NULL`).Scan(&active); err != nil {
		t.Fatal(err)
	}
	if active != 2 {
		t.Fatalf("active credentials = %d, want 2", active)
	}
}

func TestValidatePINRejectsWeakOrMalformedValues(t *testing.T) {
	for _, pin := range []string{"", "123", "12345", "123456", "0000", "1111", "1234", "4321", "abcd"} {
		if err := ValidatePIN(pin); err == nil {
			t.Fatalf("ValidatePIN(%q) expected an error", pin)
		}
	}
	for _, pin := range []string{"0427", "2468", "5192"} {
		if err := ValidatePIN(pin); err != nil {
			t.Fatalf("ValidatePIN(%q) error = %v", pin, err)
		}
	}
}

func TestCreateSessionRejectsConcurrentPasswordWork(t *testing.T) {
	service := &Service{loginSlots: NewSlot()}
	if _, acquired := service.loginSlots.Acquire(); !acquired {
		t.Fatal("a fresh slot must be available")
	}

	_, err := service.CreateSession(
		context.Background(),
		"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
		"2468",
		false,
	)
	if !errors.Is(err, ErrLoginBusy) {
		t.Fatalf("CreateSession error = %v, want ErrLoginBusy", err)
	}
}

func TestRandomQRCredentialsAreUniqueAndContain256Bits(t *testing.T) {
	seen := make(map[string]bool)
	for index := 0; index < 128; index++ {
		token, err := randomToken()
		if err != nil {
			t.Fatal(err)
		}
		decoded, err := base64.RawURLEncoding.DecodeString(token)
		if err != nil || len(decoded) != 32 {
			t.Fatalf("credential %q did not contain 32 random bytes", token)
		}
		if !validCredentialToken(token) {
			t.Fatalf("generated credential %q was rejected", token)
		}
		if seen[token] {
			t.Fatal("generated duplicate QR credential")
		}
		seen[token] = true
	}

	for _, token := range []string{"", "not-base64", "AAAAAAAA", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"} {
		if validCredentialToken(token) {
			t.Fatalf("malformed credential %q was accepted", token)
		}
	}
}

func TestLockDurationIncreasesAfterFiveFailures(t *testing.T) {
	if lockDuration(5).Minutes() != 15 || lockDuration(6).Minutes() != 30 || lockDuration(9).Hours() != 4 {
		t.Fatal("lock duration did not follow the documented exponential schedule")
	}
}
