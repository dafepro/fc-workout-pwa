package authn

import (
	"context"
	"encoding/base64"
	"errors"
	"testing"
)

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
	service := &Service{loginSlots: make(chan struct{}, 1)}
	service.loginSlots <- struct{}{}

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
