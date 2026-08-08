package main

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/url"
	"os"
	"strings"
	"time"
	// The runtime image carries no zoneinfo, and this command does not import
	// internal/config, so it must embed the zone database itself. Without this,
	// every --time-zone except UTC fails, including this command's own default.
	_ "time/tzdata"

	qrcode "github.com/skip2/go-qrcode"

	"github.com/dafepro/fc-workout-pwa/backend/internal/authn"
	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
)

func main() {
	if err := run(os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "admin:", err)
		os.Exit(1)
	}
}

func run(arguments []string, stdout io.Writer) error {
	if len(arguments) == 0 {
		return usageError()
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	switch arguments[0] {
	case "bootstrap-team":
		return bootstrapTeam(ctx, arguments[1:], stdout)
	case "provision-player":
		return provisionPlayer(ctx, arguments[1:], stdout)
	case "rotate-player-login":
		return rotatePlayer(ctx, arguments[1:], stdout)
	case "revoke-player-login":
		return revokePlayer(ctx, arguments[1:], stdout)
	case "list-players":
		return listPlayers(ctx, arguments[1:], stdout)
	case "credential-status":
		return credentialStatus(ctx, arguments[1:], stdout)
	case "deactivate-player":
		return deactivatePlayer(ctx, arguments[1:], stdout)
	default:
		return usageError()
	}
}

func bootstrapTeam(ctx context.Context, arguments []string, stdout io.Writer) error {
	flags := flag.NewFlagSet("bootstrap-team", flag.ContinueOnError)
	databaseURL := flags.String("database-url", envOr("DATABASE_URL", "file:data/zoomigo.db"), "SQLite database URL")
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
	return json.NewEncoder(stdout).Encode(map[string]string{"clubId": clubID, "teamId": teamID})
}

func provisionPlayer(ctx context.Context, arguments []string, stdout io.Writer) error {
	flags := flag.NewFlagSet("provision-player", flag.ContinueOnError)
	databaseURL := flags.String("database-url", envOr("DATABASE_URL", "file:data/zoomigo.db"), "")
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
	pin, err := generatePIN()
	if err != nil {
		return err
	}
	db, err := open(ctx, *databaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	var clubID, timeZone string
	if err = db.QueryRowContext(ctx, `SELECT club_id, time_zone FROM teams WHERE id = ?`, *teamID).Scan(&clubID, &timeZone); err != nil {
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
	activeFrom, err := teamLocalDate(now, timeZone)
	if err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO team_memberships (team_id,player_id,active_from) VALUES (?,?,?)`, *teamID, playerID, activeFrom); err != nil {
		return err
	}
	if err = tx.Commit(); err != nil {
		return err
	}
	return issueLogin(ctx, db, accountID, pin, *loginURL, *qrOutput, stdout, map[string]string{"accountId": accountID, "playerId": playerID})
}

func rotatePlayer(ctx context.Context, arguments []string, stdout io.Writer) error {
	flags := flag.NewFlagSet("rotate-player-login", flag.ContinueOnError)
	databaseURL := flags.String("database-url", envOr("DATABASE_URL", "file:data/zoomigo.db"), "")
	playerID := flags.String("player-id", "", "")
	loginURL := flags.String("login-url", "", "")
	qrOutput := flags.String("qr-output", "", "")
	if err := flags.Parse(arguments); err != nil {
		return err
	}
	pin, err := generatePIN()
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
	return issueLogin(ctx, db, accountID, pin, *loginURL, *qrOutput, stdout, map[string]string{"accountId": accountID, "playerId": *playerID})
}

func revokePlayer(ctx context.Context, arguments []string, stdout io.Writer) error {
	flags := flag.NewFlagSet("revoke-player-login", flag.ContinueOnError)
	databaseURL := flags.String("database-url", envOr("DATABASE_URL", "file:data/zoomigo.db"), "")
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
	return json.NewEncoder(stdout).Encode(map[string]string{"status": "revoked", "playerId": *playerID})
}

// deactivatePlayer is the CLI's last word on an account: access stops
// everywhere and nothing is erased. Erasure is a separate, audited workflow.
func deactivatePlayer(ctx context.Context, arguments []string, stdout io.Writer) error {
	flags := flag.NewFlagSet("deactivate-player", flag.ContinueOnError)
	databaseURL := flags.String("database-url", envOr("DATABASE_URL", "file:data/zoomigo.db"), "")
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
	if _, err = db.ExecContext(ctx, `UPDATE accounts SET status = 'disabled' WHERE id = ?`, accountID); err != nil {
		return err
	}
	return json.NewEncoder(stdout).Encode(map[string]string{"status": "deactivated", "playerId": *playerID})
}

type playerSummary struct {
	PlayerID        string `json:"playerId"`
	FirstName       string `json:"firstName"`
	LastInitial     string `json:"lastInitial"`
	AccountStatus   string `json:"accountStatus"`
	CredentialState string `json:"credentialState"`
}

func listPlayers(ctx context.Context, arguments []string, stdout io.Writer) error {
	flags := flag.NewFlagSet("list-players", flag.ContinueOnError)
	databaseURL := flags.String("database-url", envOr("DATABASE_URL", "file:data/zoomigo.db"), "")
	teamID := flags.String("team-id", "", "restrict the listing to one team")
	if err := flags.Parse(arguments); err != nil {
		return err
	}
	db, err := open(ctx, *databaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	query := `SELECT p.id, p.first_name, p.last_initial, a.status, c.id, c.locked_until
		FROM players p
		JOIN accounts a ON a.player_id = p.id
		LEFT JOIN auth_credentials c ON c.account_id = a.id AND c.revoked_at IS NULL`
	parameters := []any{}
	if *teamID != "" {
		query += ` WHERE EXISTS (SELECT 1 FROM team_memberships m WHERE m.player_id = p.id AND m.team_id = ?)`
		parameters = append(parameters, *teamID)
	}
	query += ` ORDER BY p.first_name, p.last_initial, p.id`
	rows, err := db.QueryContext(ctx, query, parameters...)
	if err != nil {
		return err
	}
	defer rows.Close()
	players := []playerSummary{}
	now := time.Now().UTC()
	for rows.Next() {
		var summary playerSummary
		var credentialID, lockedUntil sql.NullString
		if err = rows.Scan(&summary.PlayerID, &summary.FirstName, &summary.LastInitial, &summary.AccountStatus, &credentialID, &lockedUntil); err != nil {
			return err
		}
		summary.CredentialState = credentialState(credentialID, lockedUntil, now)
		players = append(players, summary)
	}
	if err = rows.Err(); err != nil {
		return err
	}
	return json.NewEncoder(stdout).Encode(map[string]any{"players": players})
}

func credentialStatus(ctx context.Context, arguments []string, stdout io.Writer) error {
	flags := flag.NewFlagSet("credential-status", flag.ContinueOnError)
	databaseURL := flags.String("database-url", envOr("DATABASE_URL", "file:data/zoomigo.db"), "")
	playerID := flags.String("player-id", "", "")
	if err := flags.Parse(arguments); err != nil {
		return err
	}
	db, err := open(ctx, *databaseURL)
	if err != nil {
		return err
	}
	defer db.Close()
	var accountID, accountStatus string
	if err = db.QueryRowContext(ctx, `SELECT id, status FROM accounts WHERE player_id = ?`, *playerID).Scan(&accountID, &accountStatus); err != nil {
		return errors.New("player account not found")
	}
	var credentialID, issuedAt, lastUsedAt, lockedUntil sql.NullString
	var failedAttempts int
	err = db.QueryRowContext(ctx, `SELECT id, issued_at, last_used_at, locked_until, failed_attempts
		FROM auth_credentials WHERE account_id = ? AND revoked_at IS NULL`, accountID).
		Scan(&credentialID, &issuedAt, &lastUsedAt, &lockedUntil, &failedAttempts)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return err
	}
	var activeSessions int
	if err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM auth_sessions
		WHERE account_id = ? AND revoked_at IS NULL AND expires_at > ?`,
		accountID, time.Now().UTC().Format(time.RFC3339Nano)).Scan(&activeSessions); err != nil {
		return err
	}
	return json.NewEncoder(stdout).Encode(map[string]any{
		"playerId":        *playerID,
		"accountStatus":   accountStatus,
		"credentialState": credentialState(credentialID, lockedUntil, time.Now().UTC()),
		"issuedAt":        issuedAt.String,
		"lastUsedAt":      lastUsedAt.String,
		"lockedUntil":     lockedUntil.String,
		"failedAttempts":  failedAttempts,
		"activeSessions":  activeSessions,
	})
}

func credentialState(credentialID, lockedUntil sql.NullString, now time.Time) string {
	if !credentialID.Valid {
		return "none"
	}
	if lockedUntil.Valid {
		if until, err := time.Parse(time.RFC3339Nano, lockedUntil.String); err == nil && now.Before(until) {
			return "locked"
		}
	}
	return "active"
}

func issueLogin(ctx context.Context, db *sql.DB, accountID, pin, loginBase, qrOutput string, stdout io.Writer, result map[string]string) error {
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
	result["pin"] = pin
	fmt.Fprintln(os.Stderr, "Keep this QR, URL, and PIN private. The PIN is shown only now and cannot be recovered; reissuing produces a new one and revokes prior sessions.")
	return json.NewEncoder(stdout).Encode(result)
}

// The PIN is generated rather than chosen so no operator can reuse a habitual
// value, and it is revealed exactly once by the caller that issued it.
func generatePIN() (string, error) {
	for {
		raw := make([]byte, 2)
		if _, err := rand.Read(raw); err != nil {
			return "", err
		}
		// Discard the tail that would not divide evenly, so every PIN is equally
		// likely rather than the low ones being slightly favoured.
		draw := int(raw[0])<<8 | int(raw[1])
		if draw >= 60000 {
			continue
		}
		pin := fmt.Sprintf("%04d", draw%10000)
		if authn.ValidatePIN(pin) == nil {
			return pin, nil
		}
	}
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
func teamLocalDate(now time.Time, timeZone string) (string, error) {
	location, err := time.LoadLocation(timeZone)
	if err != nil {
		return "", errors.New("team has an invalid time zone")
	}
	return now.In(location).Format("2006-01-02"), nil
}
func requireProvisioningApproval(testOnly bool) error {
	if testOnly || os.Getenv("PRODUCTION_DATA_APPROVED") == "true" {
		return nil
	}
	return errors.New("real player provisioning is locked; complete the production approval checklist and set PRODUCTION_DATA_APPROVED=true, or use --test-only for a disposable test identity")
}
func usageError() error {
	return errors.New("usage: zoomigo-admin bootstrap-team|provision-player|rotate-player-login|revoke-player-login|list-players|credential-status|deactivate-player [flags]")
}
