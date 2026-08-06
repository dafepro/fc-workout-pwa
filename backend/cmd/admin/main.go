package main

import (
	"bufio"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"

	qrcode "github.com/skip2/go-qrcode"
	"golang.org/x/term"

	"github.com/dafepro/fc-workout-pwa/backend/internal/authn"
	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		fmt.Fprintln(os.Stderr, "admin:", err)
		os.Exit(1)
	}
}

func run(arguments []string) error {
	if len(arguments) == 0 {
		return usageError()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	switch arguments[0] {
	case "bootstrap-team":
		return bootstrapTeam(ctx, arguments[1:])
	case "provision-player":
		return provisionPlayer(ctx, arguments[1:])
	case "rotate-player-login":
		return rotatePlayer(ctx, arguments[1:])
	case "revoke-player-login":
		return revokePlayer(ctx, arguments[1:])
	default:
		return usageError()
	}
}

func bootstrapTeam(ctx context.Context, arguments []string) error {
	flags := flag.NewFlagSet("bootstrap-team", flag.ContinueOnError)
	databaseURL := flags.String("database-url", envOr("DATABASE_URL", "file:data/stridecrew.db"), "SQLite database URL")
	clubName := flags.String("club-name", "", "club name")
	teamName := flags.String("team-name", "", "team name")
	seasonID := flags.String("season-id", "", "season identifier")
	timeZone := flags.String("time-zone", "America/Chicago", "IANA time zone")
	weeklyGoal := flags.Int("weekly-goal", 3, "weekly goal from 1 through 7")
	if err := flags.Parse(arguments); err != nil {
		return err
	}
	if strings.TrimSpace(*clubName) == "" || strings.TrimSpace(*teamName) == "" || strings.TrimSpace(*seasonID) == "" || *weeklyGoal < 1 || *weeklyGoal > 7 {
		return errors.New("club-name, team-name, season-id, and weekly-goal 1..7 are required")
	}
	if _, err := time.LoadLocation(*timeZone); err != nil {
		return errors.New("time-zone must be a valid IANA zone")
	}
	db, err := open(ctx, *databaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	clubID, err := newID("club")
	if err != nil {
		return err
	}
	teamID, err := newID("team")
	if err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `INSERT INTO clubs (id,name,created_at) VALUES (?,?,?)`, clubID, strings.TrimSpace(*clubName), now); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO teams (id,club_id,name,season_id,weekly_default_goal,time_zone,created_at) VALUES (?,?,?,?,?,?,?)`, teamID, clubID, strings.TrimSpace(*teamName), strings.TrimSpace(*seasonID), *weeklyGoal, *timeZone, now); err != nil {
		return err
	}
	if err = tx.Commit(); err != nil {
		return err
	}
	return json.NewEncoder(os.Stdout).Encode(map[string]string{"clubId": clubID, "teamId": teamID})
}

func provisionPlayer(ctx context.Context, arguments []string) error {
	flags := flag.NewFlagSet("provision-player", flag.ContinueOnError)
	databaseURL := flags.String("database-url", envOr("DATABASE_URL", "file:data/stridecrew.db"), "")
	teamID := flags.String("team-id", "", "")
	first := flags.String("first-name", "", "")
	last := flags.String("last-initial", "", "")
	loginURL := flags.String("login-url", "", "")
	qrOutput := flags.String("qr-output", "", "")
	testOnly := flags.Bool("test-only", false, "assert this player is a disposable test identity")
	if err := flags.Parse(arguments); err != nil {
		return err
	}
	if err := requireProvisioningApproval(*testOnly); err != nil {
		return err
	}
	if *teamID == "" || strings.TrimSpace(*first) == "" || len(strings.TrimSpace(*last)) != 1 {
		return errors.New("team-id, first-name, and one-character last-initial are required")
	}
	pin, err := readPIN()
	if err != nil {
		return err
	}
	db, err := open(ctx, *databaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	var clubID string
	if err = db.QueryRowContext(ctx, `SELECT club_id FROM teams WHERE id = ?`, *teamID).Scan(&clubID); err != nil {
		return errors.New("team not found")
	}
	playerID, err := newID("player")
	if err != nil {
		return err
	}
	accountID, err := newID("account")
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `INSERT INTO players (id,club_id,first_name,last_initial,avatar_configuration_json,created_at) VALUES (?,?,?,?,?,?)`, playerID, clubID, strings.TrimSpace(*first), strings.ToUpper(strings.TrimSpace(*last)), "{}", now.Format(time.RFC3339Nano)); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO accounts (id,club_id,player_id,role,status,created_at) VALUES (?,?,?,'player','active',?)`, accountID, clubID, playerID, now.Format(time.RFC3339Nano)); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO team_memberships (team_id,player_id,active_from) VALUES (?,?,?)`, *teamID, playerID, now.Format("2006-01-02")); err != nil {
		return err
	}
	if err = tx.Commit(); err != nil {
		return err
	}
	return issueLogin(ctx, db, accountID, pin, *loginURL, *qrOutput, map[string]string{"accountId": accountID, "playerId": playerID})
}

func rotatePlayer(ctx context.Context, arguments []string) error {
	flags := flag.NewFlagSet("rotate-player-login", flag.ContinueOnError)
	databaseURL := flags.String("database-url", envOr("DATABASE_URL", "file:data/stridecrew.db"), "")
	playerID := flags.String("player-id", "", "")
	loginURL := flags.String("login-url", "", "")
	qrOutput := flags.String("qr-output", "", "")
	if err := flags.Parse(arguments); err != nil {
		return err
	}
	pin, err := readPIN()
	if err != nil {
		return err
	}
	db, err := open(ctx, *databaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	var accountID string
	if err = db.QueryRowContext(ctx, `SELECT id FROM accounts WHERE player_id = ? AND status='active'`, *playerID).Scan(&accountID); err != nil {
		return errors.New("active player account not found")
	}
	return issueLogin(ctx, db, accountID, pin, *loginURL, *qrOutput, map[string]string{"accountId": accountID, "playerId": *playerID})
}

func revokePlayer(ctx context.Context, arguments []string) error {
	flags := flag.NewFlagSet("revoke-player-login", flag.ContinueOnError)
	databaseURL := flags.String("database-url", envOr("DATABASE_URL", "file:data/stridecrew.db"), "")
	playerID := flags.String("player-id", "", "")
	if err := flags.Parse(arguments); err != nil {
		return err
	}
	db, err := open(ctx, *databaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	var accountID string
	if err = db.QueryRowContext(ctx, `SELECT id FROM accounts WHERE player_id = ?`, *playerID).Scan(&accountID); err != nil {
		return errors.New("player account not found")
	}
	if err = authn.NewService(db).RevokeAccountCredentials(ctx, accountID); err != nil {
		return err
	}
	return json.NewEncoder(os.Stdout).Encode(map[string]string{"status": "revoked", "playerId": *playerID})
}

func issueLogin(ctx context.Context, db *sql.DB, accountID, pin, loginBase, qrOutput string, result map[string]string) error {
	if _, err := loginLink(loginBase, "validation"); err != nil {
		return err
	}
	if qrOutput != "" {
		if _, err := os.Lstat(qrOutput); err == nil {
			return errors.New("qr-output already exists")
		} else if !errors.Is(err, os.ErrNotExist) {
			return err
		}
	}
	credential, err := authn.NewService(db).IssueCredential(ctx, accountID, pin)
	if err != nil {
		return err
	}
	login, err := loginLink(loginBase, credential.Token)
	if err != nil {
		return err
	}
	if qrOutput != "" {
		png, err := qrcode.Encode(login, qrcode.Medium, 512)
		if err != nil {
			return err
		}
		file, err := os.OpenFile(qrOutput, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if err != nil {
			return err
		}
		if _, err = file.Write(png); err != nil {
			file.Close()
			return err
		}
		if err = file.Close(); err != nil {
			return err
		}
		result["qrOutput"] = qrOutput
	}
	result["credentialId"] = credential.ID
	result["loginUrl"] = login
	fmt.Fprintln(os.Stderr, "Keep this QR and URL private. Reissuing it revokes prior sessions.")
	return json.NewEncoder(os.Stdout).Encode(result)
}

func readPIN() (string, error) {
	fmt.Fprint(os.Stderr, "Four-digit player PIN: ")
	var bytes []byte
	var err error
	if term.IsTerminal(int(os.Stdin.Fd())) {
		bytes, err = term.ReadPassword(int(os.Stdin.Fd()))
		fmt.Fprintln(os.Stderr)
	} else {
		reader := bufio.NewReader(os.Stdin)
		var value string
		value, err = reader.ReadString('\n')
		bytes = []byte(strings.TrimSpace(value))
	}
	if err != nil {
		return "", err
	}
	pin := strings.TrimSpace(string(bytes))
	return pin, authn.ValidatePIN(pin)
}
func loginLink(raw, token string) (string, error) {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil {
		return "", errors.New("login-url must be an absolute https URL")
	}
	parsed.RawFragment = ""
	parsed.Fragment = "credential=" + token
	return parsed.String(), nil
}
func open(ctx context.Context, databaseURL string) (*sql.DB, error) {
	db, err := database.Open(ctx, databaseURL)
	if err != nil {
		return nil, err
	}
	if err = database.Migrate(ctx, db); err != nil {
		db.Close()
		return nil, err
	}
	return db, nil
}
func newID(prefix string) (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return prefix + "_" + base64.RawURLEncoding.EncodeToString(raw), nil
}
func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
func requireProvisioningApproval(testOnly bool) error {
	if testOnly || os.Getenv("PRODUCTION_DATA_APPROVED") == "true" {
		return nil
	}
	return errors.New("real player provisioning is locked; complete the production approval checklist and set PRODUCTION_DATA_APPROVED=true, or use --test-only for a disposable test identity")
}
func usageError() error {
	return errors.New("usage: stridecrew-admin bootstrap-team|provision-player|rotate-player-login|revoke-player-login [flags]")
}
