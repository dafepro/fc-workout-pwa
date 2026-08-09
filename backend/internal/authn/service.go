package authn

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"regexp"
	"time"

	"golang.org/x/crypto/argon2"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

const (
	argonTime         = uint32(3)
	argonMemory       = uint32(64 * 1024)
	argonThreads      = uint8(1)
	argonKeyLength    = uint32(32)
	shortSession      = 12 * time.Hour
	rememberedSession = 30 * 24 * time.Hour
)

var (
	ErrInvalidLogin       = errors.New("invalid login")
	ErrLoginLocked        = errors.New("login locked")
	ErrLoginBusy          = errors.New("login busy")
	ErrInvalidPIN         = errors.New("invalid PIN")
	ErrAccountUnavailable = errors.New("account unavailable")
	pinPattern            = regexp.MustCompile(`^[0-9]{4}$`)
)

// Slot admits one Argon2 derivation at a time. The VM has 512 MiB and each
// derivation reserves 64 MiB, so this is first a memory limit.
//
// Player and staff sign-in hold one of these each rather than sharing a single
// one. Sharing kept the ceiling at 64 MiB, but it also meant the two paths
// competed: the player endpoint is necessarily public, and a flood against it
// took the only slot and left every coach's console sign-in answering "staff
// login busy". Two slots put the ceiling at 128 MiB, which the 512 MiB VM
// carries, and neither path can starve the other. Widening either one past a
// single token is what the memory budget actually forbids.
type Slot struct{ tokens chan struct{} }

func NewSlot() *Slot { return &Slot{tokens: make(chan struct{}, 1)} }

// Acquire never waits: a queue of sign-ins holding 64 MiB each is the failure
// this exists to prevent. The caller turns a refusal into a retry-after.
func (slot *Slot) Acquire() (release func(), acquired bool) {
	select {
	case slot.tokens <- struct{}{}:
		return func() { <-slot.tokens }, true
	default:
		return nil, false
	}
}

type Service struct {
	db         *sql.DB
	now        func() time.Time
	loginSlots *Slot
}

type TeamProfile struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type PlayerProfile struct {
	ID          string        `json:"id"`
	FirstName   string        `json:"firstName"`
	LastInitial string        `json:"lastInitial"`
	Teams       []TeamProfile `json:"teams"`
}

type Session struct {
	Token     string         `json:"token,omitempty"`
	ExpiresAt string         `json:"expiresAt"`
	AccountID string         `json:"accountId"`
	Role      domain.Role    `json:"role"`
	Player    *PlayerProfile `json:"player"`
}

type Credential struct {
	ID    string
	Token string
}

func NewService(db *sql.DB) *Service { return NewServiceWithSlot(db, NewSlot()) }

func NewServiceWithSlot(db *sql.DB, slot *Slot) *Service {
	return &Service{db: db, now: time.Now, loginSlots: slot}
}

func (service *Service) Authenticate(ctx context.Context, bearerToken string) (domain.Actor, error) {
	session, actor, err := service.lookupSession(ctx, bearerToken)
	if err != nil {
		return domain.Actor{}, ErrUnauthenticated
	}
	if service.now().UTC().Sub(session.lastSeenAt) >= 24*time.Hour {
		_, _ = service.db.ExecContext(ctx, `UPDATE auth_sessions SET last_seen_at = ? WHERE id = ? AND revoked_at IS NULL`, service.now().UTC().Format(time.RFC3339Nano), session.id)
	}
	return actor, nil
}

func (service *Service) CreateSession(ctx context.Context, credentialToken, pin string, remember bool) (Session, error) {
	if !validCredentialToken(credentialToken) || !pinPattern.MatchString(pin) {
		return Session{}, ErrInvalidLogin
	}
	release, acquired := service.loginSlots.Acquire()
	if !acquired {
		return Session{}, ErrLoginBusy
	}
	defer release()

	now := service.now().UTC()
	selector := sha256.Sum256([]byte(credentialToken))
	connection, err := service.db.Conn(ctx)
	if err != nil {
		return Session{}, fmt.Errorf("acquire auth connection: %w", err)
	}
	defer connection.Close()
	if _, err = connection.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		return Session{}, fmt.Errorf("begin auth transaction: %w", err)
	}
	committed := false
	defer func() {
		if !committed {
			_, _ = connection.ExecContext(context.Background(), "ROLLBACK")
		}
	}()

	var credentialID, accountID string
	var salt, expected []byte
	var failed int
	var lockedUntil, revokedAt sql.NullString
	err = connection.QueryRowContext(ctx, `SELECT id, account_id, verifier_salt, verifier_hash, failed_attempts, locked_until, revoked_at FROM auth_credentials WHERE selector_hash = ?`, selector[:]).Scan(&credentialID, &accountID, &salt, &expected, &failed, &lockedUntil, &revokedAt)
	if errors.Is(err, sql.ErrNoRows) {
		// Deriving against a throwaway salt costs exactly what a real check
		// costs, which is the point: without it, "no such code" answers
		// measurably faster than "wrong PIN" and enumerating valid QR codes
		// becomes a timing measurement rather than a guess (REQ-105).
		burnVerifierTime(credentialToken, pin)
		if err = insertAudit(ctx, connection, "", "", "", "login_unknown_credential", "unknown_selector", now); err != nil {
			return Session{}, err
		}
		if _, err = connection.ExecContext(ctx, "COMMIT"); err != nil {
			return Session{}, err
		}
		committed = true
		return Session{}, ErrInvalidLogin
	}
	if err != nil {
		return Session{}, fmt.Errorf("find credential: %w", err)
	}
	if revokedAt.Valid {
		burnVerifierTime(credentialToken, pin)
		return Session{}, ErrInvalidLogin
	}
	if lockedUntil.Valid {
		until, parseErr := time.Parse(time.RFC3339Nano, lockedUntil.String)
		if parseErr != nil {
			return Session{}, fmt.Errorf("parse credential lock: %w", parseErr)
		}
		if now.Before(until) {
			return Session{}, ErrLoginLocked
		}
	}
	actual := deriveVerifier(credentialToken, pin, salt)
	if subtle.ConstantTimeCompare(actual, expected) != 1 {
		failed++
		var lock any
		event := "login_failed"
		if failed >= 10 {
			_, err = connection.ExecContext(ctx, `UPDATE auth_credentials SET failed_attempts = 10, revoked_at = ? WHERE id = ?`, now.Format(time.RFC3339Nano), credentialID)
			if err == nil {
				_, err = connection.ExecContext(ctx, `UPDATE auth_sessions SET revoked_at = ? WHERE credential_id = ? AND revoked_at IS NULL`, now.Format(time.RFC3339Nano), credentialID)
			}
			event = "login_locked"
		} else {
			if failed >= 5 {
				lock = now.Add(lockDuration(failed)).Format(time.RFC3339Nano)
				event = "login_locked"
			}
			_, err = connection.ExecContext(ctx, `UPDATE auth_credentials SET failed_attempts = ?, locked_until = ? WHERE id = ?`, failed, lock, credentialID)
		}
		if err != nil {
			return Session{}, fmt.Errorf("record login failure: %w", err)
		}
		if err = insertAudit(ctx, connection, accountID, credentialID, "", event, "invalid_credentials", now); err != nil {
			return Session{}, err
		}
		if _, err = connection.ExecContext(ctx, "COMMIT"); err != nil {
			return Session{}, err
		}
		committed = true
		if failed >= 5 {
			return Session{}, ErrLoginLocked
		}
		return Session{}, ErrInvalidLogin
	}

	var role, status, clubID string
	var playerID sql.NullString
	if err = connection.QueryRowContext(ctx, `SELECT role, status, club_id, player_id FROM accounts WHERE id = ?`, accountID).Scan(&role, &status, &clubID, &playerID); err != nil || status != "active" || role != string(domain.RolePlayer) || !playerID.Valid {
		return Session{}, ErrAccountUnavailable
	}
	duration := shortSession
	if remember {
		duration = rememberedSession
	}
	token, err := randomToken()
	if err != nil {
		return Session{}, err
	}
	tokenHash := sha256.Sum256([]byte(token))
	sessionID, err := randomID("session")
	if err != nil {
		return Session{}, err
	}
	expires := now.Add(duration)
	if _, err = connection.ExecContext(ctx, `INSERT INTO auth_sessions (id, account_id, credential_id, token_hash, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, sessionID, accountID, credentialID, tokenHash[:], now.Format(time.RFC3339Nano), expires.Format(time.RFC3339Nano), now.Format(time.RFC3339Nano)); err != nil {
		return Session{}, fmt.Errorf("insert session: %w", err)
	}
	if _, err = connection.ExecContext(ctx, `UPDATE auth_credentials SET failed_attempts = 0, locked_until = NULL, last_used_at = ? WHERE id = ?`, now.Format(time.RFC3339Nano), credentialID); err != nil {
		return Session{}, err
	}
	if err = insertAudit(ctx, connection, accountID, credentialID, sessionID, "login_succeeded", "", now); err != nil {
		return Session{}, err
	}
	if _, err = connection.ExecContext(ctx, "COMMIT"); err != nil {
		return Session{}, err
	}
	committed = true
	if err = connection.Close(); err != nil {
		return Session{}, err
	}
	view, err := service.Session(ctx, token)
	if err != nil {
		return Session{}, err
	}
	view.Token = token
	return view, nil
}

func (service *Service) Session(ctx context.Context, token string) (Session, error) {
	row, actor, err := service.lookupSession(ctx, token)
	if err != nil {
		return Session{}, ErrUnauthenticated
	}
	view := Session{ExpiresAt: row.expiresAt.Format(time.RFC3339Nano), AccountID: actor.AccountID, Role: actor.Role}
	if actor.PlayerID != "" {
		var player PlayerProfile
		if err := service.db.QueryRowContext(ctx, `SELECT id, first_name, last_initial FROM players WHERE id = ?`, actor.PlayerID).Scan(&player.ID, &player.FirstName, &player.LastInitial); err != nil {
			return Session{}, err
		}
		player.Teams = []TeamProfile{}
		today := service.now().UTC().Format("2006-01-02")
		rows, err := service.db.QueryContext(ctx, `SELECT t.id, t.name FROM teams t JOIN team_memberships m ON m.team_id = t.id WHERE m.player_id = ? AND m.active_from <= ? AND (m.active_to IS NULL OR m.active_to >= ?) ORDER BY t.name`, actor.PlayerID, today, today)
		if err != nil {
			return Session{}, err
		}
		defer rows.Close()
		for rows.Next() {
			var team TeamProfile
			if err := rows.Scan(&team.ID, &team.Name); err != nil {
				return Session{}, err
			}
			player.Teams = append(player.Teams, team)
		}
		if err := rows.Err(); err != nil {
			return Session{}, err
		}
		view.Player = &player
	}
	return view, nil
}

func (service *Service) RevokeSession(ctx context.Context, token string) error {
	hash := sha256.Sum256([]byte(token))
	now := service.now().UTC()
	tx, err := service.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var sessionID, accountID, credentialID string
	if err = tx.QueryRowContext(ctx, `SELECT id, account_id, credential_id FROM auth_sessions WHERE token_hash = ? AND revoked_at IS NULL`, hash[:]).Scan(&sessionID, &accountID, &credentialID); err != nil {
		return ErrUnauthenticated
	}
	result, err := tx.ExecContext(ctx, `UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`, now.Format(time.RFC3339Nano), sessionID)
	if err != nil {
		return err
	}
	count, _ := result.RowsAffected()
	if count != 1 {
		return ErrUnauthenticated
	}
	if err = insertAudit(ctx, tx, accountID, credentialID, sessionID, "session_revoked", "logout", now); err != nil {
		return err
	}
	return tx.Commit()
}

func (service *Service) RevokeAccountCredentials(ctx context.Context, accountID string) error {
	now := service.now().UTC()
	tx, err := service.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	rows, err := tx.QueryContext(ctx, `SELECT id FROM auth_credentials WHERE account_id = ? AND revoked_at IS NULL`, accountID)
	if err != nil {
		return err
	}
	var credentialIDs []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		credentialIDs = append(credentialIDs, id)
	}
	if err = rows.Close(); err != nil {
		return err
	}
	stamp := now.Format(time.RFC3339Nano)
	if _, err = tx.ExecContext(ctx, `UPDATE auth_sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL`, stamp, accountID); err != nil {
		return err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE auth_credentials SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL`, stamp, accountID); err != nil {
		return err
	}
	for _, credentialID := range credentialIDs {
		if err = insertAudit(ctx, tx, accountID, credentialID, "", "credential_revoked", "operator", now); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (service *Service) IssueCredential(ctx context.Context, accountID, pin string) (Credential, error) {
	token, err := randomToken()
	if err != nil {
		return Credential{}, err
	}
	return service.issueCredential(ctx, accountID, pin, token)
}

func (service *Service) IssueCredentialWithToken(ctx context.Context, accountID, pin, token string) (Credential, error) {
	return service.issueCredential(ctx, accountID, pin, token)
}

func (service *Service) ResetE2ECredential(ctx context.Context, accountID, pin, token string) error {
	tx, err := service.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	for _, statement := range []string{"DELETE FROM auth_audit_events", "DELETE FROM auth_sessions", "DELETE FROM auth_credentials"} {
		if _, err := tx.ExecContext(ctx, statement); err != nil {
			return err
		}
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	_, err = service.IssueCredentialWithToken(ctx, accountID, pin, token)
	return err
}

func (service *Service) issueCredential(ctx context.Context, accountID, pin, token string) (Credential, error) {
	if err := ValidatePIN(pin); err != nil {
		return Credential{}, err
	}
	if !validCredentialToken(token) {
		return Credential{}, errors.New("credential token must contain 32 random bytes")
	}
	var status, role string
	if err := service.db.QueryRowContext(ctx, `SELECT status, role FROM accounts WHERE id = ?`, accountID).Scan(&status, &role); err != nil || status != "active" || role != string(domain.RolePlayer) {
		return Credential{}, ErrAccountUnavailable
	}
	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return Credential{}, err
	}
	selector := sha256.Sum256([]byte(token))
	verifier := deriveVerifier(token, pin, salt)
	now := service.now().UTC()
	id, err := randomID("credential")
	if err != nil {
		return Credential{}, err
	}
	tx, err := service.db.BeginTx(ctx, nil)
	if err != nil {
		return Credential{}, err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `UPDATE auth_credentials SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL`, now.Format(time.RFC3339Nano), accountID); err != nil {
		return Credential{}, err
	}
	if _, err = tx.ExecContext(ctx, `UPDATE auth_sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL`, now.Format(time.RFC3339Nano), accountID); err != nil {
		return Credential{}, err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO auth_credentials (id, account_id, selector_hash, verifier_salt, verifier_hash, issued_at) VALUES (?, ?, ?, ?, ?, ?)`, id, accountID, selector[:], salt, verifier, now.Format(time.RFC3339Nano)); err != nil {
		return Credential{}, err
	}
	if err = insertAudit(ctx, tx, accountID, id, "", "credential_issued", "", now); err != nil {
		return Credential{}, err
	}
	if err = tx.Commit(); err != nil {
		return Credential{}, err
	}
	return Credential{ID: id, Token: token}, nil
}

// GeneratePIN draws a PIN rather than letting anyone choose one, so no
// operator can reuse a habitual value, and discards the tail that would not
// divide evenly so every PIN is equally likely.
func GeneratePIN() (string, error) {
	for {
		raw := make([]byte, 2)
		if _, err := rand.Read(raw); err != nil {
			return "", err
		}
		draw := int(raw[0])<<8 | int(raw[1])
		if draw >= 60000 {
			continue
		}
		pin := fmt.Sprintf("%04d", draw%10000)
		if ValidatePIN(pin) == nil {
			return pin, nil
		}
	}
}

func ValidatePIN(pin string) error {
	if !pinPattern.MatchString(pin) {
		return ErrInvalidPIN
	}
	blocked := map[string]bool{
		"0000": true, "1111": true, "2222": true, "3333": true, "4444": true,
		"5555": true, "6666": true, "7777": true, "8888": true, "9999": true,
		"1234": true, "4321": true,
	}
	if blocked[pin] {
		return ErrInvalidPIN
	}
	return nil
}

type sessionRow struct {
	id                    string
	expiresAt, lastSeenAt time.Time
}

func (service *Service) lookupSession(ctx context.Context, token string) (sessionRow, domain.Actor, error) {
	hash := sha256.Sum256([]byte(token))
	var row sessionRow
	var expires, seen, role string
	var player sql.NullString
	var actor domain.Actor
	err := service.db.QueryRowContext(ctx, `SELECT s.id, s.expires_at, s.last_seen_at, a.id, a.role, a.player_id, a.club_id FROM auth_sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ? AND s.revoked_at IS NULL AND a.status = 'active'`, hash[:]).Scan(&row.id, &expires, &seen, &actor.AccountID, &role, &player, &actor.ClubID)
	if err != nil {
		return row, actor, err
	}
	row.expiresAt, err = time.Parse(time.RFC3339Nano, expires)
	if err != nil || !service.now().UTC().Before(row.expiresAt) {
		return row, actor, ErrUnauthenticated
	}
	row.lastSeenAt, _ = time.Parse(time.RFC3339Nano, seen)
	actor.Role = domain.Role(role)
	if player.Valid {
		actor.PlayerID = player.String
	}
	if actor.Role == domain.RoleCoach {
		today := service.now().UTC().Format("2006-01-02")
		rows, qerr := service.db.QueryContext(ctx, `SELECT team_id FROM coach_team_assignments WHERE account_id = ? AND active_from <= ? AND (active_to IS NULL OR active_to >= ?)`, actor.AccountID, today, today)
		if qerr != nil {
			return row, actor, qerr
		}
		defer rows.Close()
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				return row, actor, err
			}
			actor.AssignedTeamIDs = append(actor.AssignedTeamIDs, id)
		}
		if err := rows.Err(); err != nil {
			return row, actor, err
		}
	}
	return row, actor, nil
}

func deriveVerifier(token, pin string, salt []byte) []byte {
	return argon2.IDKey([]byte(token+"\x00"+pin), salt, argonTime, argonMemory, argonThreads, argonKeyLength)
}

// A fixed salt is safe here because the result is discarded; what matters is
// that the work happened. Marked used so no compiler is tempted to elide it.
var timingSalt = []byte("zoomigo-timing-equalizer")

func burnVerifierTime(token, pin string) {
	if len(deriveVerifier(token, pin, timingSalt)) == 0 {
		panic("empty verifier")
	}
}
func lockDuration(failed int) time.Duration { return 15 * time.Minute * time.Duration(1<<(failed-5)) }

func validCredentialToken(token string) bool {
	decoded, err := base64.RawURLEncoding.DecodeString(token)
	return err == nil && len(decoded) == 32
}

func randomToken() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}
func randomID(prefix string) (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return prefix + "_" + base64.RawURLEncoding.EncodeToString(raw), nil
}

type auditExecutor interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func insertAudit(ctx context.Context, executor auditExecutor, accountID, credentialID, sessionID, eventType, detail string, now time.Time) error {
	id, err := randomID("audit")
	if err != nil {
		return err
	}
	// An empty identifier is a genuine absence -- a failure against a credential
	// nobody owns has no account -- so it is stored as NULL rather than as "".
	var a, c, s any
	if accountID != "" {
		a = accountID
	}
	if credentialID != "" {
		c = credentialID
	}
	if sessionID != "" {
		s = sessionID
	}
	_, err = executor.ExecContext(ctx, `INSERT INTO auth_audit_events (id, account_id, credential_id, session_id, event_type, detail_code, occurred_at) VALUES (?, ?, ?, ?, ?, ?, ?)`, id, a, c, s, eventType, detail, now.Format(time.RFC3339Nano))
	return err
}

type Fallback struct{ Primary, Secondary Authenticator }

func (fallback Fallback) Authenticate(ctx context.Context, token string) (domain.Actor, error) {
	actor, err := fallback.Primary.Authenticate(ctx, token)
	if err == nil {
		return actor, nil
	}
	return fallback.Secondary.Authenticate(ctx, token)
}
