package main

import (
	"os"
	"testing"
	"time"
)

func TestLoginLinkKeepsCredentialOutOfServerRequest(t *testing.T) {
	link, err := loginLink("https://zoomigo.example/login", "secret_token")
	if err != nil {
		t.Fatal(err)
	}
	if link != "https://zoomigo.example/login#credential=secret_token" {
		t.Fatalf("unexpected link: %s", link)
	}
}

func TestLoginLinkRequiresHTTPS(t *testing.T) {
	for _, raw := range []string{"", "http://zoomigo.example/login", "https://user@zoomigo.example/login"} {
		if _, err := loginLink(raw, "secret_token"); err == nil {
			t.Fatalf("loginLink(%q) expected an error", raw)
		}
	}
}

func TestLoginLinkReplacesExistingFragment(t *testing.T) {
	link, err := loginLink("https://zoomigo.example/login#old", "one_two-two")
	if err != nil {
		t.Fatal(err)
	}
	if link != "https://zoomigo.example/login#credential=one_two-two" {
		t.Fatalf("unexpected link: %s", link)
	}
}

func TestProvisioningGateAllowsTestAccountsButRequiresExplicitProductionApproval(t *testing.T) {
	t.Setenv("PRODUCTION_DATA_APPROVED", "false")
	if err := requireProvisioningApproval(true); err != nil {
		t.Fatalf("test-only provisioning was rejected: %v", err)
	}
	if err := requireProvisioningApproval(false); err == nil {
		t.Fatal("production provisioning succeeded without approval")
	}

	if err := os.Setenv("PRODUCTION_DATA_APPROVED", "true"); err != nil {
		t.Fatal(err)
	}
	if err := requireProvisioningApproval(false); err != nil {
		t.Fatalf("approved production provisioning was rejected: %v", err)
	}

	if err := os.Setenv("PRODUCTION_DATA_APPROVED", "TRUE"); err != nil {
		t.Fatal(err)
	}
	if err := requireProvisioningApproval(false); err == nil {
		t.Fatal("non-canonical production approval was accepted")
	}
}

func TestProvisionedMembershipStartsOnTheTeamsLocalDate(t *testing.T) {
	now := time.Date(2026, time.August, 8, 2, 0, 0, 0, time.UTC)

	date, err := teamLocalDate(now, "America/Chicago")
	if err != nil {
		t.Fatal(err)
	}
	if date != "2026-08-07" {
		t.Fatalf("team-local membership date = %q, want 2026-08-07", date)
	}
	if _, err := teamLocalDate(now, "not/a-zone"); err == nil {
		t.Fatal("invalid team time zone was accepted")
	}
}
