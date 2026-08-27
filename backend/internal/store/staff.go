package store

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

// Everything the console reads or writes about clubs, teams, rosters, and
// credentials. Authorization is not decided here: handlers ask the domain
// helpers first and pass down only what the actor is allowed to touch.

var (
	ErrStaffNotFound = errors.New("not found")
	ErrStaffInvalid  = errors.New("invalid")
)

type ClubSummary struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	TeamCount int    `json:"teamCount"`
	CreatedAt string `json:"createdAt"`
}

type TeamSummary struct {
	ID          string `json:"id"`
	ClubID      string `json:"clubId"`
	ClubName    string `json:"clubName"`
	Name        string `json:"name"`
	SeasonID    string `json:"seasonId"`
	TimeZone    string `json:"timeZone"`
	WeeklyGoal  int    `json:"weeklyGoal"`
	PlayerCount int    `json:"playerCount"`
}

type RosterEntry struct {
	PlayerID        string `json:"playerId"`
	FirstName       string `json:"firstName"`
	LastInitial     string `json:"lastInitial"`
	AccountID       string `json:"accountId"`
	AccountStatus   string `json:"accountStatus"`
	CredentialState string `json:"credentialState"`
	MembershipFrom  string `json:"membershipFrom"`
	MembershipTo    string `json:"membershipTo,omitempty"`
	LastActivityOn  string `json:"lastActivityOn,omitempty"`
}

type SearchResult struct {
	Players []RosterEntry `json:"players"`
	Teams   []TeamSummary `json:"teams"`
}

type PlayerDetail struct {
	Player      RosterEntry    `json:"player"`
	ClubID      string         `json:"clubId"`
	ClubName    string         `json:"clubName"`
	Memberships []Membership   `json:"memberships"`
	Credential  CredentialInfo `json:"credential"`
	RecentAuth  []AuthEvent    `json:"recentAuthEvents"`
}

type Membership struct {
	TeamID   string `json:"teamId"`
	TeamName string `json:"teamName"`
	From     string `json:"activeFrom"`
	To       string `json:"activeTo,omitempty"`
}

type CredentialInfo struct {
	State          string `json:"state"`
	IssuedAt       string `json:"issuedAt,omitempty"`
	LastUsedAt     string `json:"lastUsedAt,omitempty"`
	LockedUntil    string `json:"lockedUntil,omitempty"`
	FailedAttempts int    `json:"failedAttempts"`
	ActiveSessions int    `json:"activeSessions"`
}

type AuthEvent struct {
	OccurredAt string `json:"occurredAt"`
	EventType  string `json:"eventType"`
	DetailCode string `json:"detailCode,omitempty"`
}

type AdminAuditEntry struct {
	OccurredAt string `json:"occurredAt"`
	Actor      string `json:"actorAccountId"`
	// Where the action came from. An entry with no actor is only readable with
	// this alongside it, so it is on every entry rather than only the new ones.
	ActorSource string `json:"actorSource"`
	Action      string `json:"action"`
	TargetType  string `json:"targetType"`
	TargetID    string `json:"targetId"`
	Detail      string `json:"detail"`
}

// StaffStore is a thin wrapper so the console's queries stay out of the
// player-facing store, which has a different reviewer and different risks.
type StaffStore struct {
	db  *sql.DB
	now func() time.Time
}

func NewStaffStore(db *sql.DB) *StaffStore { return &StaffStore{db: db, now: time.Now} }

func (staff *StaffStore) ListClubs(ctx context.Context) ([]ClubSummary, error) {
	rows, err := staff.db.QueryContext(ctx, `SELECT c.id, c.name, c.created_at,
		(SELECT COUNT(*) FROM teams t WHERE t.club_id = c.id) FROM clubs c ORDER BY c.name, c.id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	clubs := []ClubSummary{}
	for rows.Next() {
		var club ClubSummary
		if err = rows.Scan(&club.ID, &club.Name, &club.CreatedAt, &club.TeamCount); err != nil {
			return nil, err
		}
		clubs = append(clubs, club)
	}
	return clubs, rows.Err()
}

func (staff *StaffStore) CreateClub(ctx context.Context, name string) (ClubSummary, error) {
	name = strings.TrimSpace(name)
	if name == "" || len([]rune(name)) > 80 {
		return ClubSummary{}, ErrStaffInvalid
	}
	id, err := newStaffID("club")
	if err != nil {
		return ClubSummary{}, err
	}
	created := stampNow(staff.now)
	if _, err = staff.db.ExecContext(ctx, `INSERT INTO clubs (id, name, created_at) VALUES (?, ?, ?)`, id, name, created); err != nil {
		return ClubSummary{}, err
	}
	return ClubSummary{ID: id, Name: name, CreatedAt: created}, nil
}

func (staff *StaffStore) ListTeams(ctx context.Context, actor domain.Actor) ([]TeamSummary, error) {
	query := `SELECT t.id, t.club_id, c.name, t.name, t.season_id, t.time_zone, t.weekly_default_goal,
		(SELECT COUNT(*) FROM team_memberships m WHERE m.team_id = t.id AND (m.active_to IS NULL OR m.active_to >= ?))
		FROM teams t JOIN clubs c ON c.id = t.club_id`
	parameters := []any{staff.now().UTC().Format("2006-01-02")}
	// A coach sees the teams they are assigned; a club admin their club. The
	// filter is here as well as in the handler so a missed check upstream
	// cannot turn into a cross-club read.
	switch actor.Role {
	case domain.RoleCoach:
		if len(actor.AssignedTeamIDs) == 0 {
			return []TeamSummary{}, nil
		}
		query += ` WHERE t.id IN (` + placeholders(len(actor.AssignedTeamIDs)) + `)`
		for _, id := range actor.AssignedTeamIDs {
			parameters = append(parameters, id)
		}
	case domain.RoleClubAdmin:
		query += ` WHERE t.club_id = ?`
		parameters = append(parameters, actor.ClubID)
	case domain.RolePlatformAdmin:
	default:
		return []TeamSummary{}, nil
	}
	query += ` ORDER BY c.name, t.name, t.id`
	rows, err := staff.db.QueryContext(ctx, query, parameters...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	teams := []TeamSummary{}
	for rows.Next() {
		var team TeamSummary
		if err = rows.Scan(&team.ID, &team.ClubID, &team.ClubName, &team.Name, &team.SeasonID, &team.TimeZone, &team.WeeklyGoal, &team.PlayerCount); err != nil {
			return nil, err
		}
		teams = append(teams, team)
	}
	return teams, rows.Err()
}

type TeamInput struct {
	ClubID     string `json:"clubId"`
	Name       string `json:"name"`
	SeasonID   string `json:"seasonId"`
	TimeZone   string `json:"timeZone"`
	WeeklyGoal int    `json:"weeklyGoal"`
}

func (input TeamInput) validate() error {
	if strings.TrimSpace(input.Name) == "" || strings.TrimSpace(input.SeasonID) == "" {
		return ErrStaffInvalid
	}
	if input.WeeklyGoal < 1 || input.WeeklyGoal > 7 {
		return ErrStaffInvalid
	}
	// The zone decides what "today" means for every date and deletion-window
	// check on this team, so it is validated rather than trusted.
	if _, err := time.LoadLocation(input.TimeZone); err != nil {
		return ErrStaffInvalid
	}
	return nil
}

func (staff *StaffStore) CreateTeam(ctx context.Context, input TeamInput) (TeamSummary, error) {
	if err := input.validate(); err != nil {
		return TeamSummary{}, err
	}
	var clubName string
	if err := staff.db.QueryRowContext(ctx, `SELECT name FROM clubs WHERE id = ?`, input.ClubID).Scan(&clubName); err != nil {
		return TeamSummary{}, ErrStaffNotFound
	}
	id, err := newStaffID("team")
	if err != nil {
		return TeamSummary{}, err
	}
	if _, err = staff.db.ExecContext(ctx, `INSERT INTO teams (id, club_id, name, season_id, weekly_default_goal, time_zone, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)`, id, input.ClubID, strings.TrimSpace(input.Name), strings.TrimSpace(input.SeasonID),
		input.WeeklyGoal, input.TimeZone, stampNow(staff.now)); err != nil {
		return TeamSummary{}, err
	}
	return TeamSummary{ID: id, ClubID: input.ClubID, ClubName: clubName, Name: input.Name, SeasonID: input.SeasonID,
		TimeZone: input.TimeZone, WeeklyGoal: input.WeeklyGoal}, nil
}

func (staff *StaffStore) UpdateTeam(ctx context.Context, teamID string, input TeamInput) (TeamSummary, error) {
	if err := input.validate(); err != nil {
		return TeamSummary{}, err
	}
	result, err := staff.db.ExecContext(ctx, `UPDATE teams SET name = ?, season_id = ?, weekly_default_goal = ?, time_zone = ? WHERE id = ?`,
		strings.TrimSpace(input.Name), strings.TrimSpace(input.SeasonID), input.WeeklyGoal, input.TimeZone, teamID)
	if err != nil {
		return TeamSummary{}, err
	}
	if changed, _ := result.RowsAffected(); changed != 1 {
		return TeamSummary{}, ErrStaffNotFound
	}
	return staff.Team(ctx, teamID)
}

func (staff *StaffStore) Team(ctx context.Context, teamID string) (TeamSummary, error) {
	var team TeamSummary
	err := staff.db.QueryRowContext(ctx, `SELECT t.id, t.club_id, c.name, t.name, t.season_id, t.time_zone, t.weekly_default_goal,
		(SELECT COUNT(*) FROM team_memberships m WHERE m.team_id = t.id)
		FROM teams t JOIN clubs c ON c.id = t.club_id WHERE t.id = ?`, teamID).
		Scan(&team.ID, &team.ClubID, &team.ClubName, &team.Name, &team.SeasonID, &team.TimeZone, &team.WeeklyGoal, &team.PlayerCount)
	if errors.Is(err, sql.ErrNoRows) {
		return TeamSummary{}, ErrStaffNotFound
	}
	return team, err
}

func (staff *StaffStore) Roster(ctx context.Context, teamID string) ([]RosterEntry, error) {
	rows, err := staff.db.QueryContext(ctx, rosterQuery+` WHERE m.team_id = ? ORDER BY p.first_name, p.last_initial, p.id`, teamID)
	if err != nil {
		return nil, err
	}
	return scanRoster(rows, staff.now().UTC())
}

// No raw performance values here: the roster answers who is on the team and
// whether they can sign in, and nothing about how fast anyone ran.
const rosterQuery = `SELECT p.id, p.first_name, p.last_initial, a.id, a.status,
	c.id, c.locked_until, m.active_from, m.active_to,
	(SELECT MAX(e.occurred_at) FROM training_entries e WHERE e.player_id = p.id AND e.deleted_at IS NULL)
	FROM players p
	JOIN accounts a ON a.player_id = p.id
	JOIN team_memberships m ON m.player_id = p.id
	LEFT JOIN auth_credentials c ON c.account_id = a.id AND c.revoked_at IS NULL`

func scanRoster(rows *sql.Rows, now time.Time) ([]RosterEntry, error) {
	defer rows.Close()
	roster := []RosterEntry{}
	for rows.Next() {
		var entry RosterEntry
		var credentialID, lockedUntil, activeTo, lastActivity sql.NullString
		if err := rows.Scan(&entry.PlayerID, &entry.FirstName, &entry.LastInitial, &entry.AccountID, &entry.AccountStatus,
			&credentialID, &lockedUntil, &entry.MembershipFrom, &activeTo, &lastActivity); err != nil {
			return nil, err
		}
		entry.CredentialState = credentialStateOf(credentialID, lockedUntil, now)
		entry.MembershipTo, entry.LastActivityOn = activeTo.String, lastActivity.String
		roster = append(roster, entry)
	}
	return roster, rows.Err()
}

func credentialStateOf(credentialID, lockedUntil sql.NullString, now time.Time) string {
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

// Search is the operator's home (F-O1): one box over players and teams
// everywhere, because the real workload is an interrupt about one child.
func (staff *StaffStore) Search(ctx context.Context, query string) (SearchResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return SearchResult{Players: []RosterEntry{}, Teams: []TeamSummary{}}, nil
	}
	pattern := "%" + strings.ToLower(query) + "%"
	playerRows, err := staff.db.QueryContext(ctx, rosterQuery+
		` WHERE lower(p.first_name) LIKE ? OR lower(p.last_initial) LIKE ? OR p.id = ?
		ORDER BY p.first_name, p.last_initial, p.id LIMIT 50`, pattern, pattern, query)
	if err != nil {
		return SearchResult{}, err
	}
	players, err := scanRoster(playerRows, staff.now().UTC())
	if err != nil {
		return SearchResult{}, err
	}
	teamRows, err := staff.db.QueryContext(ctx, `SELECT t.id, t.club_id, c.name, t.name, t.season_id, t.time_zone, t.weekly_default_goal,
		(SELECT COUNT(*) FROM team_memberships m WHERE m.team_id = t.id)
		FROM teams t JOIN clubs c ON c.id = t.club_id
		WHERE lower(t.name) LIKE ? OR lower(c.name) LIKE ? OR t.id = ?
		ORDER BY c.name, t.name LIMIT 50`, pattern, pattern, query)
	if err != nil {
		return SearchResult{}, err
	}
	defer teamRows.Close()
	teams := []TeamSummary{}
	for teamRows.Next() {
		var team TeamSummary
		if err = teamRows.Scan(&team.ID, &team.ClubID, &team.ClubName, &team.Name, &team.SeasonID, &team.TimeZone,
			&team.WeeklyGoal, &team.PlayerCount); err != nil {
			return SearchResult{}, err
		}
		teams = append(teams, team)
	}
	return SearchResult{Players: players, Teams: teams}, teamRows.Err()
}

// PlayerDetail is the one screen a search result opens: everything needed to
// work out why a child cannot sign in, and every repair action beside it.
func (staff *StaffStore) PlayerDetail(ctx context.Context, playerID string) (PlayerDetail, error) {
	now := staff.now().UTC()
	var detail PlayerDetail
	var accountID string
	var lastActivity sql.NullString
	err := staff.db.QueryRowContext(ctx, `SELECT p.first_name, p.last_initial, a.id, a.status, p.club_id, c.name,
		(SELECT MAX(e.occurred_at) FROM training_entries e WHERE e.player_id = p.id AND e.deleted_at IS NULL)
		FROM players p JOIN accounts a ON a.player_id = p.id JOIN clubs c ON c.id = p.club_id WHERE p.id = ?`, playerID).
		Scan(&detail.Player.FirstName, &detail.Player.LastInitial, &accountID, &detail.Player.AccountStatus,
			&detail.ClubID, &detail.ClubName, &lastActivity)
	if errors.Is(err, sql.ErrNoRows) {
		return PlayerDetail{}, ErrStaffNotFound
	}
	if err != nil {
		return PlayerDetail{}, err
	}
	detail.Player.PlayerID, detail.Player.AccountID = playerID, accountID
	detail.Player.LastActivityOn = lastActivity.String

	rows, err := staff.db.QueryContext(ctx, `SELECT m.team_id, t.name, m.active_from, m.active_to
		FROM team_memberships m JOIN teams t ON t.id = m.team_id WHERE m.player_id = ? ORDER BY m.active_from DESC`, playerID)
	if err != nil {
		return PlayerDetail{}, err
	}
	detail.Memberships = []Membership{}
	for rows.Next() {
		var membership Membership
		var to sql.NullString
		if err = rows.Scan(&membership.TeamID, &membership.TeamName, &membership.From, &to); err != nil {
			rows.Close()
			return PlayerDetail{}, err
		}
		membership.To = to.String
		detail.Memberships = append(detail.Memberships, membership)
	}
	rows.Close()

	detail.Credential, err = staff.credentialInfo(ctx, accountID, now)
	if err != nil {
		return PlayerDetail{}, err
	}
	detail.Player.CredentialState = detail.Credential.State

	events, err := staff.db.QueryContext(ctx, `SELECT occurred_at, event_type, detail_code FROM auth_audit_events
		WHERE account_id = ? ORDER BY occurred_at DESC, id DESC LIMIT 20`, accountID)
	if err != nil {
		return PlayerDetail{}, err
	}
	defer events.Close()
	detail.RecentAuth = []AuthEvent{}
	for events.Next() {
		var event AuthEvent
		var code sql.NullString
		if err = events.Scan(&event.OccurredAt, &event.EventType, &code); err != nil {
			return PlayerDetail{}, err
		}
		event.DetailCode = code.String
		detail.RecentAuth = append(detail.RecentAuth, event)
	}
	return detail, events.Err()
}

func (staff *StaffStore) credentialInfo(ctx context.Context, accountID string, now time.Time) (CredentialInfo, error) {
	var info CredentialInfo
	var credentialID, issuedAt, lastUsedAt, lockedUntil sql.NullString
	err := staff.db.QueryRowContext(ctx, `SELECT id, issued_at, last_used_at, locked_until, failed_attempts
		FROM auth_credentials WHERE account_id = ? AND revoked_at IS NULL`, accountID).
		Scan(&credentialID, &issuedAt, &lastUsedAt, &lockedUntil, &info.FailedAttempts)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return CredentialInfo{}, err
	}
	info.State = credentialStateOf(credentialID, lockedUntil, now)
	info.IssuedAt, info.LastUsedAt, info.LockedUntil = issuedAt.String, lastUsedAt.String, lockedUntil.String
	if err = staff.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM auth_sessions WHERE account_id = ? AND revoked_at IS NULL AND expires_at > ?`,
		accountID, now.Format(time.RFC3339Nano)).Scan(&info.ActiveSessions); err != nil {
		return CredentialInfo{}, err
	}
	return info, nil
}

// ClubOfTeam and ClubOfPlayer let a handler ask the domain helpers about the
// right club before it reads or writes anything.
func (staff *StaffStore) ClubOfTeam(ctx context.Context, teamID string) (string, error) {
	var clubID string
	err := staff.db.QueryRowContext(ctx, `SELECT club_id FROM teams WHERE id = ?`, teamID).Scan(&clubID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrStaffNotFound
	}
	return clubID, err
}

func (staff *StaffStore) ClubOfPlayer(ctx context.Context, playerID string) (string, error) {
	var clubID string
	err := staff.db.QueryRowContext(ctx, `SELECT club_id FROM players WHERE id = ?`, playerID).Scan(&clubID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrStaffNotFound
	}
	return clubID, err
}

// TeamsOfPlayer is how a coach's scope is checked for a player action: they may
// act on a player who is on one of their teams, and no other.
func (staff *StaffStore) TeamsOfPlayer(ctx context.Context, playerID string) ([]string, error) {
	today := staff.now().UTC().Format("2006-01-02")
	rows, err := staff.db.QueryContext(ctx, `SELECT team_id FROM team_memberships
		WHERE player_id = ? AND active_from <= ? AND (active_to IS NULL OR active_to >= ?)`, playerID, today, today)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var teams []string
	for rows.Next() {
		var id string
		if err = rows.Scan(&id); err != nil {
			return nil, err
		}
		teams = append(teams, id)
	}
	return teams, rows.Err()
}

// Membership starts on the team's own calendar date, matching what
// provision-player already does. Using the host's UTC date here is the bug that
// stopped a provisioned player from saving an entry on their first evening.
func (staff *StaffStore) StartMembership(ctx context.Context, teamID, playerID string) error {
	activeFrom, err := staff.teamToday(ctx, teamID)
	if err != nil {
		return err
	}
	var open int
	if err = staff.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM team_memberships
		WHERE team_id = ? AND player_id = ? AND (active_to IS NULL OR active_to >= ?)`, teamID, playerID, activeFrom).Scan(&open); err != nil {
		return err
	}
	if open > 0 {
		return ErrStaffInvalid
	}
	_, err = staff.db.ExecContext(ctx, `INSERT INTO team_memberships (team_id, player_id, active_from) VALUES (?, ?, ?)`, teamID, playerID, activeFrom)
	return err
}

func (staff *StaffStore) EndMembership(ctx context.Context, teamID, playerID string) error {
	activeTo, err := staff.teamToday(ctx, teamID)
	if err != nil {
		return err
	}
	result, err := staff.db.ExecContext(ctx, `UPDATE team_memberships SET active_to = ?
		WHERE team_id = ? AND player_id = ? AND active_to IS NULL`, activeTo, teamID, playerID)
	if err != nil {
		return err
	}
	if changed, _ := result.RowsAffected(); changed == 0 {
		return ErrStaffNotFound
	}
	return nil
}

func (staff *StaffStore) teamToday(ctx context.Context, teamID string) (string, error) {
	var zone string
	if err := staff.db.QueryRowContext(ctx, `SELECT time_zone FROM teams WHERE id = ?`, teamID).Scan(&zone); err != nil {
		return "", ErrStaffNotFound
	}
	location, err := time.LoadLocation(zone)
	if err != nil {
		return "", fmt.Errorf("team %s has an invalid time zone: %w", teamID, err)
	}
	return staff.now().In(location).Format("2006-01-02"), nil
}

func (staff *StaffStore) CreatePlayer(ctx context.Context, teamID, firstName, lastInitial string) (playerID, accountID string, err error) {
	firstName = strings.TrimSpace(firstName)
	lastInitial = strings.ToUpper(strings.TrimSpace(lastInitial))
	// First name and last initial only. There is no other personal data to
	// collect and no field in which to put it.
	if firstName == "" || len([]rune(firstName)) > 40 || len([]rune(lastInitial)) != 1 {
		return "", "", ErrStaffInvalid
	}
	var clubID string
	if err = staff.db.QueryRowContext(ctx, `SELECT club_id FROM teams WHERE id = ?`, teamID).Scan(&clubID); err != nil {
		return "", "", ErrStaffNotFound
	}
	activeFrom, err := staff.teamToday(ctx, teamID)
	if err != nil {
		return "", "", err
	}
	if playerID, err = newStaffID("player"); err != nil {
		return "", "", err
	}
	if accountID, err = newStaffID("account"); err != nil {
		return "", "", err
	}
	created := stampNow(staff.now)
	tx, err := staff.db.BeginTx(ctx, nil)
	if err != nil {
		return "", "", err
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at)
		VALUES (?, ?, ?, ?, '{}', ?)`, playerID, clubID, firstName, lastInitial, created); err != nil {
		return "", "", err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO accounts (id, club_id, player_id, role, status, created_at)
		VALUES (?, ?, ?, 'player', 'active', ?)`, accountID, clubID, playerID, created); err != nil {
		return "", "", err
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO team_memberships (team_id, player_id, active_from) VALUES (?, ?, ?)`,
		teamID, playerID, activeFrom); err != nil {
		return "", "", err
	}
	return playerID, accountID, tx.Commit()
}

func (staff *StaffStore) AccountOfPlayer(ctx context.Context, playerID string) (string, error) {
	var accountID string
	err := staff.db.QueryRowContext(ctx, `SELECT id FROM accounts WHERE player_id = ?`, playerID).Scan(&accountID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrStaffNotFound
	}
	return accountID, err
}

// Unlock clears the counter as well as the deadline. A credential left at five
// failures re-locks for twice as long on the next mistake, which is how a child
// who mistyped once ends up locked out for an hour.
func (staff *StaffStore) UnlockCredential(ctx context.Context, accountID string) error {
	result, err := staff.db.ExecContext(ctx, `UPDATE auth_credentials SET failed_attempts = 0, locked_until = NULL
		WHERE account_id = ? AND revoked_at IS NULL`, accountID)
	if err != nil {
		return err
	}
	if changed, _ := result.RowsAffected(); changed == 0 {
		return ErrStaffNotFound
	}
	return nil
}

func (staff *StaffStore) DeactivatePlayer(ctx context.Context, accountID string) error {
	result, err := staff.db.ExecContext(ctx, `UPDATE accounts SET status = 'disabled' WHERE id = ? AND role = 'player'`, accountID)
	if err != nil {
		return err
	}
	if changed, _ := result.RowsAffected(); changed != 1 {
		return ErrStaffNotFound
	}
	return nil
}

type AssignmentCatalogEntry struct {
	Key                  string  `json:"key"`
	DisplayName          string  `json:"displayName"`
	ActivityDefinitionID string  `json:"activityDefinitionId"`
	DefaultTargetValue   float64 `json:"defaultTargetValue"`
	DefaultTargetUnit    string  `json:"defaultTargetUnit"`
}

// ListAssignmentCatalog is F-C7's picker: only approved entries, so a catalog
// row awaiting review never becomes something a coach can assign. Ordering by
// activity groups an activity's presets together, and matches the order the
// player's own picker uses (approvedActivities orders by the same id).
func (staff *StaffStore) ListAssignmentCatalog(ctx context.Context) ([]AssignmentCatalogEntry, error) {
	rows, err := staff.db.QueryContext(ctx, `SELECT key, display_name, activity_definition_id, default_target_value, default_target_unit
		FROM assignment_catalog WHERE approved = 1
		ORDER BY activity_definition_id, default_target_value`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	catalog := []AssignmentCatalogEntry{}
	for rows.Next() {
		var entry AssignmentCatalogEntry
		if err = rows.Scan(&entry.Key, &entry.DisplayName, &entry.ActivityDefinitionID,
			&entry.DefaultTargetValue, &entry.DefaultTargetUnit); err != nil {
			return nil, err
		}
		catalog = append(catalog, entry)
	}
	return catalog, rows.Err()
}

type AssignmentSummary struct {
	ID           string  `json:"id"`
	CatalogKey   string  `json:"catalogKey"`
	ActivityName string  `json:"activityName"`
	TargetValue  float64 `json:"targetValue"`
	TargetUnit   string  `json:"targetUnit"`
	StartsOn     string  `json:"startsOn"`
	DueOn        string  `json:"dueOn"`
	CreatedAt    string  `json:"createdAt"`
}

type AssignmentInput struct {
	CatalogKey  string
	TargetValue float64
	TargetUnit  string
	StartsOn    string
	DueOn       string
}

var assignmentTargetUnits = map[string]bool{"reps": true, "minutes": true, "miles": true}

// CreateAssignment is F-C7. The catalog key must be one of the approved
// entries and carries the activity it assigns; the window is validated as
// team-local calendar dates, not parsed as a timestamp, matching every other
// date the console reasons about.
func (staff *StaffStore) CreateAssignment(ctx context.Context, teamID string, input AssignmentInput) (string, error) {
	if err := validAssignmentWindow(AssignmentUpdate{TargetValue: input.TargetValue,
		TargetUnit: input.TargetUnit, StartsOn: input.StartsOn, DueOn: input.DueOn}); err != nil {
		return "", err
	}
	var activityDefinitionID string
	err := staff.db.QueryRowContext(ctx, `SELECT activity_definition_id FROM assignment_catalog WHERE key = ? AND approved = 1`,
		input.CatalogKey).Scan(&activityDefinitionID)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrStaffInvalid
	}
	if err != nil {
		return "", err
	}
	if _, err = staff.teamToday(ctx, teamID); err != nil {
		return "", err
	}
	id, err := newStaffID("assignment")
	if err != nil {
		return "", err
	}
	_, err = staff.db.ExecContext(ctx, `INSERT INTO assignments
		(id, team_id, activity_definition_id, catalog_key, target_value, target_unit, starts_on, due_on, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		id, teamID, activityDefinitionID, input.CatalogKey, input.TargetValue, input.TargetUnit,
		input.StartsOn, input.DueOn, stampNow(staff.now))
	if err != nil {
		return "", err
	}
	return id, nil
}

// AssignmentUpdate is the amendable half of an assignment: what the target is
// and when the window runs. The activity is not amendable, because changing it
// would rewrite what players were already asked to do -- to ask for something
// else, delete an assignment that has not started and set a new one.
type AssignmentUpdate struct {
	TargetValue float64
	TargetUnit  string
	StartsOn    string
	DueOn       string
}

// ErrAssignmentStarted is the refusal that comes with an alternative: an
// assignment players may already have trained against cannot be deleted or have
// its start moved, but it can be ended early.
var ErrAssignmentStarted = errors.New("assignment already started")

// UpdateAssignment is REQ-513. A coach who typed the wrong target or the wrong
// week amends it here. The start may only move while it is still in the future;
// once it has passed it is a fact about which entries counted, not a setting.
func (staff *StaffStore) UpdateAssignment(ctx context.Context, teamID, assignmentID string, update AssignmentUpdate) error {
	if err := validAssignmentWindow(update); err != nil {
		return err
	}
	today, err := staff.teamToday(ctx, teamID)
	if err != nil {
		return err
	}
	var startsOn string
	err = staff.db.QueryRowContext(ctx, `SELECT starts_on FROM assignments WHERE id = ? AND team_id = ?`,
		assignmentID, teamID).Scan(&startsOn)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrStaffNotFound
	}
	if err != nil {
		return err
	}
	if startsOn <= today && update.StartsOn != startsOn {
		return ErrAssignmentStarted
	}
	_, err = staff.db.ExecContext(ctx, `UPDATE assignments
		SET target_value = ?, target_unit = ?, starts_on = ?, due_on = ?
		WHERE id = ? AND team_id = ?`,
		update.TargetValue, update.TargetUnit, update.StartsOn, update.DueOn, assignmentID, teamID)
	return err
}

// DeleteAssignment is REQ-514, and only for one created by mistake. An
// assignment that has started may have entries logged against it, and one a
// reaction points at is a foreign key parent, so deleting either would take a
// player's own history with it. Both refuse in favour of EndAssignment.
func (staff *StaffStore) DeleteAssignment(ctx context.Context, teamID, assignmentID string) error {
	today, err := staff.teamToday(ctx, teamID)
	if err != nil {
		return err
	}
	var startsOn string
	var referenced int
	err = staff.db.QueryRowContext(ctx, `SELECT a.starts_on,
		(SELECT COUNT(*) FROM reactions r WHERE r.context_assignment_id = a.id)
		+ (SELECT COUNT(*) FROM training_entries e WHERE e.assignment_id = a.id)
		FROM assignments a WHERE a.id = ? AND a.team_id = ?`, assignmentID, teamID).Scan(&startsOn, &referenced)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrStaffNotFound
	}
	if err != nil {
		return err
	}
	if startsOn <= today || referenced > 0 {
		return ErrAssignmentStarted
	}
	_, err = staff.db.ExecContext(ctx, `DELETE FROM assignments WHERE id = ? AND team_id = ?`, assignmentID, teamID)
	return err
}

// EndAssignment closes a live assignment's window today, in the team's own time
// zone. It is the verb that always works on something already under way, and it
// leaves every entry logged against it exactly where it is.
func (staff *StaffStore) EndAssignment(ctx context.Context, teamID, assignmentID string) (string, error) {
	today, err := staff.teamToday(ctx, teamID)
	if err != nil {
		return "", err
	}
	var startsOn string
	err = staff.db.QueryRowContext(ctx, `SELECT starts_on FROM assignments WHERE id = ? AND team_id = ?`,
		assignmentID, teamID).Scan(&startsOn)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrStaffNotFound
	}
	if err != nil {
		return "", err
	}
	if startsOn > today {
		return "", ErrStaffInvalid
	}
	if _, err = staff.db.ExecContext(ctx, `UPDATE assignments SET due_on = ? WHERE id = ? AND team_id = ?`,
		today, assignmentID, teamID); err != nil {
		return "", err
	}
	return today, nil
}

func validAssignmentWindow(update AssignmentUpdate) error {
	if update.TargetValue <= 0 || !assignmentTargetUnits[update.TargetUnit] {
		return ErrStaffInvalid
	}
	if _, err := time.Parse("2006-01-02", update.StartsOn); err != nil {
		return ErrStaffInvalid
	}
	if _, err := time.Parse("2006-01-02", update.DueOn); err != nil {
		return ErrStaffInvalid
	}
	if update.StartsOn > update.DueOn {
		return ErrStaffInvalid
	}
	return nil
}

// ListAssignments is the team's assignment history, most recently due first.
func (staff *StaffStore) ListAssignments(ctx context.Context, teamID string) ([]AssignmentSummary, error) {
	rows, err := staff.db.QueryContext(ctx, `SELECT a.id, a.catalog_key, d.name, a.target_value, a.target_unit, a.starts_on, a.due_on, a.created_at
		FROM assignments a JOIN activity_definitions d ON d.id = a.activity_definition_id
		WHERE a.team_id = ? ORDER BY a.due_on DESC, a.created_at DESC`, teamID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	assignments := []AssignmentSummary{}
	for rows.Next() {
		var assignment AssignmentSummary
		if err = rows.Scan(&assignment.ID, &assignment.CatalogKey, &assignment.ActivityName, &assignment.TargetValue,
			&assignment.TargetUnit, &assignment.StartsOn, &assignment.DueOn, &assignment.CreatedAt); err != nil {
			return nil, err
		}
		assignments = append(assignments, assignment)
	}
	return assignments, rows.Err()
}

type PlayerCompletion struct {
	PlayerID    string `json:"playerId"`
	FirstName   string `json:"firstName"`
	LastInitial string `json:"lastInitial"`
}

type AssignmentCompletion struct {
	Assignment *AssignmentSummary `json:"assignment,omitempty"`
	Completed  []PlayerCompletion `json:"completed"`
	OneAway    []PlayerCompletion `json:"oneAway"`
	KeepGoing  []PlayerCompletion `json:"keepGoing"`
}

// CurrentAssignmentCompletion is F-C8: the live assignment, which is the
// earliest-due assignment whose team-local window includes today (the same
// rule the player's Home screen uses), grouped per
// UX_AND_SAFETY_RULES.md's Completed / One Away / Keep Going labels. One Away
// means the player has logged an entry against this assignment without yet
// reaching its target; Keep Going means no entry at all. Coaches see who is
// in which group, never a raw value (SEC-8).
func (staff *StaffStore) CurrentAssignmentCompletion(ctx context.Context, teamID string) (AssignmentCompletion, error) {
	completion := AssignmentCompletion{Completed: []PlayerCompletion{}, OneAway: []PlayerCompletion{}, KeepGoing: []PlayerCompletion{}}
	teamDay, err := staff.teamToday(ctx, teamID)
	if err != nil {
		return AssignmentCompletion{}, err
	}
	var assignment AssignmentSummary
	err = staff.db.QueryRowContext(ctx, `SELECT a.id, a.catalog_key, d.name, a.target_value, a.target_unit, a.starts_on, a.due_on
		FROM assignments a JOIN activity_definitions d ON d.id = a.activity_definition_id
		WHERE a.team_id = ? AND a.starts_on <= ? AND a.due_on >= ?
		ORDER BY a.due_on, a.created_at DESC LIMIT 1`, teamID, teamDay, teamDay).Scan(
		&assignment.ID, &assignment.CatalogKey, &assignment.ActivityName, &assignment.TargetValue,
		&assignment.TargetUnit, &assignment.StartsOn, &assignment.DueOn)
	if errors.Is(err, sql.ErrNoRows) {
		return completion, nil
	}
	if err != nil {
		return AssignmentCompletion{}, err
	}
	completion.Assignment = &assignment

	rows, err := staff.db.QueryContext(ctx, `SELECT p.id, p.first_name, p.last_initial,
		EXISTS (SELECT 1 FROM training_entries e WHERE e.assignment_id = ? AND e.player_id = p.id
			AND e.deleted_at IS NULL AND e.result_unit = ? AND e.result_value >= ?
			AND (e.completion_outcome IS NULL OR e.completion_outcome <> 'partial')) AS met,
		EXISTS (SELECT 1 FROM training_entries e WHERE e.assignment_id = ? AND e.player_id = p.id AND e.deleted_at IS NULL) AS started
		FROM players p
		JOIN team_memberships m ON m.player_id = p.id
		WHERE m.team_id = ? AND m.active_from <= ? AND (m.active_to IS NULL OR m.active_to >= ?)
		ORDER BY p.first_name, p.last_initial`,
		assignment.ID, assignment.TargetUnit, assignment.TargetValue, assignment.ID, teamID, teamDay, teamDay)
	if err != nil {
		return AssignmentCompletion{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var player PlayerCompletion
		var met, started bool
		if err = rows.Scan(&player.PlayerID, &player.FirstName, &player.LastInitial, &met, &started); err != nil {
			return AssignmentCompletion{}, err
		}
		switch {
		case met:
			completion.Completed = append(completion.Completed, player)
		case started:
			completion.OneAway = append(completion.OneAway, player)
		default:
			completion.KeepGoing = append(completion.KeepGoing, player)
		}
	}
	if err = rows.Err(); err != nil {
		return AssignmentCompletion{}, err
	}
	return completion, nil
}

func (staff *StaffStore) AssignCoach(ctx context.Context, accountID, teamID string) error {
	activeFrom, err := staff.teamToday(ctx, teamID)
	if err != nil {
		return err
	}
	var role string
	if err = staff.db.QueryRowContext(ctx, `SELECT role FROM accounts WHERE id = ?`, accountID).Scan(&role); err != nil {
		return ErrStaffNotFound
	}
	if role != string(domain.RoleCoach) && role != string(domain.RoleClubAdmin) {
		return ErrStaffInvalid
	}
	var open int
	if err = staff.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM coach_team_assignments
		WHERE account_id = ? AND team_id = ? AND (active_to IS NULL OR active_to >= ?)`, accountID, teamID, activeFrom).Scan(&open); err != nil {
		return err
	}
	if open > 0 {
		return ErrStaffInvalid
	}
	_, err = staff.db.ExecContext(ctx, `INSERT INTO coach_team_assignments (team_id, account_id, active_from) VALUES (?, ?, ?)`,
		teamID, accountID, activeFrom)
	return err
}

// Ending the assignment is what removes the team from that coach's console,
// and it takes effect on their next request because the actor's team list is
// rebuilt per request rather than carried in the session.
func (staff *StaffStore) UnassignCoach(ctx context.Context, accountID, teamID string) error {
	activeTo, err := staff.teamToday(ctx, teamID)
	if err != nil {
		return err
	}
	result, err := staff.db.ExecContext(ctx, `UPDATE coach_team_assignments SET active_to = ?
		WHERE account_id = ? AND team_id = ? AND active_to IS NULL`, activeTo, accountID, teamID)
	if err != nil {
		return err
	}
	if changed, _ := result.RowsAffected(); changed == 0 {
		return ErrStaffNotFound
	}
	return nil
}

type AuditFilter struct {
	AccountID string
	Since     string
	Limit     int
}

// The combined trail: authentication events and management actions, carrying
// opaque row keys only, exactly as `zoomigo-admin audit` already does.
func (staff *StaffStore) Audit(ctx context.Context, filter AuditFilter) ([]AdminAuditEntry, error) {
	if filter.Limit < 1 || filter.Limit > 200 {
		filter.Limit = 100
	}
	entries := []AdminAuditEntry{}
	authQuery := `SELECT occurred_at, COALESCE(account_id, ''), event_type, COALESCE(detail_code, '') FROM auth_audit_events WHERE 1 = 1`
	parameters := []any{}
	if filter.AccountID != "" {
		authQuery += ` AND account_id = ?`
		parameters = append(parameters, filter.AccountID)
	}
	if filter.Since != "" {
		authQuery += ` AND occurred_at >= ?`
		parameters = append(parameters, filter.Since)
	}
	authQuery += ` ORDER BY occurred_at DESC, id DESC LIMIT ?`
	rows, err := staff.db.QueryContext(ctx, authQuery, append(parameters, filter.Limit)...)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var entry AdminAuditEntry
		if err = rows.Scan(&entry.OccurredAt, &entry.Actor, &entry.Action, &entry.Detail); err != nil {
			rows.Close()
			return nil, err
		}
		entry.TargetType, entry.TargetID = "account", entry.Actor
		// An authentication event is the account's own act, not an operator's.
		entry.ActorSource = ActorSourceSelf
		entries = append(entries, entry)
	}
	rows.Close()

	adminQuery := `SELECT occurred_at, COALESCE(actor_account_id, ''), actor_source, action, target_type, target_id, detail_json FROM admin_audit_events WHERE 1 = 1`
	parameters = parameters[:0]
	if filter.AccountID != "" {
		adminQuery += ` AND (actor_account_id = ? OR target_id = ?)`
		parameters = append(parameters, filter.AccountID, filter.AccountID)
	}
	if filter.Since != "" {
		adminQuery += ` AND occurred_at >= ?`
		parameters = append(parameters, filter.Since)
	}
	adminQuery += ` ORDER BY occurred_at DESC, id DESC LIMIT ?`
	adminRows, err := staff.db.QueryContext(ctx, adminQuery, append(parameters, filter.Limit)...)
	if err != nil {
		return nil, err
	}
	defer adminRows.Close()
	for adminRows.Next() {
		var entry AdminAuditEntry
		if err = adminRows.Scan(&entry.OccurredAt, &entry.Actor, &entry.ActorSource, &entry.Action, &entry.TargetType, &entry.TargetID, &entry.Detail); err != nil {
			return nil, err
		}
		entries = append(entries, entry)
	}
	if err = adminRows.Err(); err != nil {
		return nil, err
	}
	sortByOccurredDescending(entries)
	if len(entries) > filter.Limit {
		entries = entries[:filter.Limit]
	}
	return entries, nil
}

// Where a recorded action came from. The column takes any value; these are the
// two this code writes, and the pairing with the actor is enforced below rather
// than by a CHECK the schema would have to be rebuilt to extend.
const (
	ActorSourceConsole = "console"
	ActorSourceCLI     = "cli"
	// Never stored: the authentication trail has no actor column, and its
	// events are always the account acting on itself. It is set on the way out
	// so one merged list has one meaning for the field.
	ActorSourceSelf = "self"
)

// RecordAdminAction is REQ-701: one row per successful mutation, naming the
// actor, the action, the target, and the time. The detail is structured
// context and never a secret (REQ-702).
func (staff *StaffStore) RecordAdminAction(ctx context.Context, actorAccountID, action, targetType, targetID string, detail map[string]any) error {
	return staff.recordAction(ctx, ActorSourceConsole, actorAccountID, action, targetType, targetID, detail)
}

// RecordCLIAction is the same trail for the break-glass path (F-O11). A CLI
// invocation has no signed-in account, so the row names the source instead of
// an actor -- which is what the NOT NULL on actor_account_id used to prevent,
// leaving `deactivate-staff` and `deactivate-player` with no trace at all.
func (staff *StaffStore) RecordCLIAction(ctx context.Context, action, targetType, targetID string, detail map[string]any) error {
	return staff.recordAction(ctx, ActorSourceCLI, "", action, targetType, targetID, detail)
}

func (staff *StaffStore) recordAction(ctx context.Context, source, actorAccountID, action, targetType, targetID string, detail map[string]any) error {
	id, err := newStaffID("adminaudit")
	if err != nil {
		return err
	}
	encoded := []byte("{}")
	if len(detail) > 0 {
		if encoded, err = json.Marshal(detail); err != nil {
			return err
		}
	}
	// The invariant the schema no longer states: a console row names an
	// account, and any other source stores NULL rather than an empty string a
	// later reader would mistake for an identifier.
	var actor any
	if source == ActorSourceConsole {
		actor = actorAccountID
	}
	_, err = staff.db.ExecContext(ctx, `INSERT INTO admin_audit_events (id, actor_account_id, actor_source, action, target_type, target_id, detail_json, occurred_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, id, actor, source, action, targetType, targetID, string(encoded), stampNow(staff.now))
	return err
}

func sortByOccurredDescending(entries []AdminAuditEntry) {
	for outer := 1; outer < len(entries); outer++ {
		for inner := outer; inner > 0 && entries[inner].OccurredAt > entries[inner-1].OccurredAt; inner-- {
			entries[inner], entries[inner-1] = entries[inner-1], entries[inner]
		}
	}
}

func placeholders(count int) string {
	return strings.TrimSuffix(strings.Repeat("?,", count), ",")
}

func newStaffID(prefix string) (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return prefix + "_" + base64.RawURLEncoding.EncodeToString(raw), nil
}

func stampNow(now func() time.Time) string { return now().UTC().Format(time.RFC3339Nano) }
