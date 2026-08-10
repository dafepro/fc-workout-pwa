package main

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/dafepro/fc-workout-pwa/backend/internal/authn"
	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/staffauth"
)

// The CLI is the break-glass path (F-O11): everything the console can do, it
// can do too, so the console never becomes the only way to perform an action it
// depends on the service to offer. It is also the bootstrap, since the first
// operator account cannot be created from a console nobody can sign in to.

func createOperator(ctx context.Context, arguments []string, stdout io.Writer) error {
	flags := flag.NewFlagSet("create-operator", flag.ContinueOnError)
	databaseURL := flags.String("database-url", envOr("DATABASE_URL", "file:data/zoomigo.db"), "SQLite database URL")
	email := flags.String("email", "", "staff email address")
	setupURL := flags.String("setup-url", "", "absolute https URL of the console setup page")
	if err := flags.Parse(arguments); err != nil {
		return err
	}
	return createStaff(ctx, *databaseURL, domain.RolePlatformAdmin, "", *email, *setupURL, stdout)
}

func createCoach(ctx context.Context, arguments []string, stdout io.Writer) error {
	flags := flag.NewFlagSet("create-coach", flag.ContinueOnError)
	databaseURL := flags.String("database-url", envOr("DATABASE_URL", "file:data/zoomigo.db"), "SQLite database URL")
	email := flags.String("email", "", "staff email address")
	clubID := flags.String("club-id", "", "club the coach belongs to")
	setupURL := flags.String("setup-url", "", "absolute https URL of the console setup page")
	if err := flags.Parse(arguments); err != nil {
		return err
	}
	if strings.TrimSpace(*clubID) == "" {
		return errors.New("club-id is required for a coach")
	}
	return createStaff(ctx, *databaseURL, domain.RoleCoach, *clubID, *email, *setupURL, stdout)
}

func createStaff(ctx context.Context, databaseURL string, role domain.Role, clubID, email, setupURL string, stdout io.Writer) error {
	if strings.TrimSpace(email) == "" {
		return errors.New("email is required")
	}
	db, err := open(ctx, databaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	service, err := staffService(db)
	if err != nil {
		return err
	}
	invitation, err := service.CreateStaffAccount(ctx, role, clubID, email, setupURL)
	if err != nil {
		return err
	}
	// The role and club, never the setup token or temporary password (REQ-702).
	recordAction(ctx, db, "staff.create", "account", invitation.AccountID,
		map[string]any{"role": string(role), "clubId": clubID})
	warnOnce()
	return json.NewEncoder(stdout).Encode(invitation)
}

func resetStaffCredential(ctx context.Context, arguments []string, stdout io.Writer) error {
	flags := flag.NewFlagSet("reset-staff-credential", flag.ContinueOnError)
	databaseURL := flags.String("database-url", envOr("DATABASE_URL", "file:data/zoomigo.db"), "SQLite database URL")
	email := flags.String("email", "", "staff email address")
	setupURL := flags.String("setup-url", "", "absolute https URL of the console setup page")
	if err := flags.Parse(arguments); err != nil {
		return err
	}
	db, err := open(ctx, *databaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	var accountID string
	if err = db.QueryRowContext(ctx, `SELECT account_id FROM auth_password_credentials WHERE email_identity = ? AND revoked_at IS NULL`,
		strings.ToLower(strings.TrimSpace(*email))).Scan(&accountID); err != nil {
		return errors.New("no staff account with that email")
	}
	service, err := staffService(db)
	if err != nil {
		return err
	}
	invitation, err := service.ResetStaffCredential(ctx, accountID, *setupURL)
	if err != nil {
		return err
	}
	recordAction(ctx, db, "staff.reset", "account", accountID, nil)
	warnOnce()
	return json.NewEncoder(stdout).Encode(invitation)
}

// deactivateStaff ends a staff account's access and frees its email address for
// a new account. It asks for the address rather than the account id because that
// is what an operator has in front of them, and it refuses an ambiguous match by
// only ever matching an unrevoked credential.
func deactivateStaff(ctx context.Context, arguments []string, stdout io.Writer) error {
	flags := flag.NewFlagSet("deactivate-staff", flag.ContinueOnError)
	databaseURL := flags.String("database-url", envOr("DATABASE_URL", "file:data/zoomigo.db"), "SQLite database URL")
	email := flags.String("email", "", "staff email address")
	if err := flags.Parse(arguments); err != nil {
		return err
	}
	if strings.TrimSpace(*email) == "" {
		return errors.New("email is required")
	}
	db, err := open(ctx, *databaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	var accountID string
	if err = db.QueryRowContext(ctx, `SELECT account_id FROM auth_password_credentials WHERE email_identity = ? AND revoked_at IS NULL`,
		strings.ToLower(strings.TrimSpace(*email))).Scan(&accountID); err != nil {
		return errors.New("no active staff account with that email")
	}
	service, err := staffService(db)
	if err != nil {
		return err
	}
	summary, err := service.DeactivateStaff(ctx, accountID)
	if err != nil {
		return err
	}
	// The address is deliberately absent: the account row is a tombstone now,
	// and the trail should not be the place the freed address survives.
	recordAction(ctx, db, "staff.deactivate", "account", accountID, nil)
	return json.NewEncoder(stdout).Encode(summary)
}

func listStaff(ctx context.Context, arguments []string, stdout io.Writer) error {
	flags := flag.NewFlagSet("list-staff", flag.ContinueOnError)
	databaseURL := flags.String("database-url", envOr("DATABASE_URL", "file:data/zoomigo.db"), "SQLite database URL")
	if err := flags.Parse(arguments); err != nil {
		return err
	}
	db, err := open(ctx, *databaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	service, err := staffService(db)
	if err != nil {
		return err
	}
	staff, err := service.ListStaff(ctx)
	if err != nil {
		return err
	}
	return json.NewEncoder(stdout).Encode(map[string]any{"staff": staff})
}

func staffService(db *sql.DB) (*staffauth.Service, error) {
	raw := strings.TrimSpace(os.Getenv("STAFF_SECRET_KEY"))
	if raw == "" {
		return nil, errors.New("STAFF_SECRET_KEY is required; it is the key that protects stored second factors")
	}
	key, err := base64.StdEncoding.DecodeString(raw)
	if err != nil || len(key) != 32 {
		return nil, errors.New("STAFF_SECRET_KEY must be 32 base64-encoded bytes")
	}
	return staffauth.NewService(db, key, authn.NewSlot()), nil
}

func warnOnce() {
	fmt.Fprintln(os.Stderr, "Keep this setup link and temporary password private. They are shown only now, they expire, and they are single use; the account chooses its own password and enrols its second factor before it can reach any roster data.")
}
