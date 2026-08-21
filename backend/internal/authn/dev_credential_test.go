//go:build dev

package authn

import "testing"

func TestIssueDevCredentialAllowsFixedPreviewPINWithoutWeakeningProductionValidation(t *testing.T) {
	service, db := sessionService(t)
	for _, statement := range []string{
		`INSERT INTO clubs (id, name, created_at) VALUES ('club-dev', 'Dev', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-dev', 'club-dev', 'Mason', 'C', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO accounts (id, club_id, player_id, role, status, created_at) VALUES ('account-dev', 'club-dev', 'player-dev', 'player', 'active', '2026-01-01T00:00:00Z')`,
	} {
		if _, err := db.Exec(statement); err != nil {
			t.Fatal(err)
		}
	}

	const token = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
	if _, err := service.IssueDevCredential(t.Context(), "account-dev", "1111", token); err != nil {
		t.Fatalf("IssueDevCredential() error = %v", err)
	}
	if _, err := service.CreateSession(t.Context(), token, "1111", false); err != nil {
		t.Fatalf("CreateSession() error = %v", err)
	}
	if ValidatePIN("1111") == nil {
		t.Fatal("production PIN validation accepted the dev-only PIN")
	}
}
