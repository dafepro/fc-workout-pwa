package httpapi

import (
	"context"
	"encoding/base64"
	"errors"
	"net/http"
	"net/url"
	"strings"

	qrcode "github.com/skip2/go-qrcode"

	"github.com/dafepro/fc-workout-pwa/backend/internal/authn"
	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/staffauth"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

// Every handler here authorizes on the session's role, and for a coach on their
// active team assignments, before it reads or writes anything. Reaching the
// route is never the permission (REQ-301).

type StaffRepository interface {
	ListClubs(context.Context) ([]store.ClubSummary, error)
	CreateClub(context.Context, string) (store.ClubSummary, error)
	ListTeams(context.Context, domain.Actor) ([]store.TeamSummary, error)
	CreateTeam(context.Context, store.TeamInput) (store.TeamSummary, error)
	UpdateTeam(context.Context, string, store.TeamInput) (store.TeamSummary, error)
	Team(context.Context, string) (store.TeamSummary, error)
	Roster(context.Context, string) ([]store.RosterEntry, error)
	Search(context.Context, string) (store.SearchResult, error)
	PlayerDetail(context.Context, string) (store.PlayerDetail, error)
	ClubOfTeam(context.Context, string) (string, error)
	ClubOfPlayer(context.Context, string) (string, error)
	TeamsOfPlayer(context.Context, string) ([]string, error)
	StartMembership(context.Context, string, string) error
	EndMembership(context.Context, string, string) error
	CreatePlayer(context.Context, string, string, string) (string, string, error)
	AccountOfPlayer(context.Context, string) (string, error)
	UnlockCredential(context.Context, string) error
	DeactivatePlayer(context.Context, string) error
	AssignCoach(context.Context, string, string) error
	UnassignCoach(context.Context, string, string) error
	Audit(context.Context, store.AuditFilter) ([]store.AdminAuditEntry, error)
	RecordAdminAction(context.Context, string, string, string, string, map[string]any) error
	ListAssignmentCatalog(context.Context) ([]store.AssignmentCatalogEntry, error)
	CreateAssignment(context.Context, string, store.AssignmentInput) (string, error)
	ListAssignments(context.Context, string) ([]store.AssignmentSummary, error)
	CurrentAssignmentCompletion(context.Context, string) (store.AssignmentCompletion, error)
}

type CredentialManager interface {
	IssueCredential(context.Context, string, string) (authn.Credential, error)
	RevokeAccountCredentials(context.Context, string) error
}

type StaffAccountManager interface {
	CreateStaffAccount(context.Context, domain.Role, string, string, string) (staffauth.StaffInvitation, error)
	ResetStaffCredential(context.Context, string, string) (staffauth.StaffInvitation, error)
	ListStaff(context.Context) ([]staffauth.StaffSummary, error)
	RequireRecentAuthentication(context.Context, string) error
}

func WithStaffRepository(repository StaffRepository) Option {
	return func(service *service) { service.staffStore = repository }
}

func WithCredentialManager(credentials CredentialManager) Option {
	return func(service *service) { service.credentials = credentials }
}

func WithStaffAccountManager(accounts StaffAccountManager) Option {
	return func(service *service) { service.staffAccounts = accounts }
}

func (service *service) registerStaffRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /v1/staff/search", service.staffSearch)
	mux.HandleFunc("GET /v1/staff/clubs", service.listClubs)
	mux.HandleFunc("POST /v1/staff/clubs", service.createClub)
	mux.HandleFunc("GET /v1/staff/teams", service.listStaffTeams)
	mux.HandleFunc("POST /v1/staff/teams", service.createStaffTeam)
	mux.HandleFunc("GET /v1/staff/teams/{teamId}", service.getStaffTeam)
	mux.HandleFunc("PUT /v1/staff/teams/{teamId}", service.updateStaffTeam)
	mux.HandleFunc("GET /v1/staff/teams/{teamId}/roster", service.getRoster)
	mux.HandleFunc("POST /v1/staff/teams/{teamId}/roster", service.startMembership)
	mux.HandleFunc("DELETE /v1/staff/teams/{teamId}/roster/{playerId}", service.endMembership)
	mux.HandleFunc("POST /v1/staff/teams/{teamId}/players", service.provisionPlayer)
	mux.HandleFunc("GET /v1/staff/assignment-catalog", service.getAssignmentCatalog)
	mux.HandleFunc("GET /v1/staff/teams/{teamId}/progress", service.getTeamProgress)
	mux.HandleFunc("GET /v1/staff/teams/{teamId}/assignments", service.listAssignments)
	mux.HandleFunc("POST /v1/staff/teams/{teamId}/assignments", service.createAssignment)
	mux.HandleFunc("GET /v1/staff/players/{playerId}", service.getPlayerDetail)
	mux.HandleFunc("POST /v1/staff/players/{playerId}/credential", service.repairCredential)
	mux.HandleFunc("POST /v1/staff/players/{playerId}/deactivate", service.deactivatePlayer)
	mux.HandleFunc("GET /v1/staff/accounts", service.listStaffAccounts)
	mux.HandleFunc("POST /v1/staff/accounts", service.createStaffAccount)
	mux.HandleFunc("POST /v1/staff/accounts/{accountId}/reset", service.resetStaffAccount)
	mux.HandleFunc("POST /v1/staff/accounts/{accountId}/team-assignments", service.assignCoach)
	mux.HandleFunc("DELETE /v1/staff/accounts/{accountId}/team-assignments/{teamId}", service.unassignCoach)
	mux.HandleFunc("GET /v1/staff/audit", service.getAudit)
}

// staffActor authenticates and refuses a player token outright, so no player
// session ever reaches a console endpoint (REQ-305).
func (service *service) staffActor(w http.ResponseWriter, r *http.Request) (domain.Actor, bool) {
	actor, ok := service.authenticate(w, r)
	if !ok {
		return domain.Actor{}, false
	}
	if actor.Role == domain.RolePlayer || actor.Role == "" {
		writeError(w, r, http.StatusForbidden, "forbidden", "This account cannot use the staff console.")
		return domain.Actor{}, false
	}
	if service.staffStore == nil {
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "The service is not ready.")
		return domain.Actor{}, false
	}
	return actor, true
}

func (service *service) operatorActor(w http.ResponseWriter, r *http.Request) (domain.Actor, bool) {
	actor, ok := service.staffActor(w, r)
	if !ok {
		return domain.Actor{}, false
	}
	if !domain.CanAdministerPlatform(actor) {
		writeError(w, r, http.StatusForbidden, "forbidden", "This action needs platform operator authority.")
		return domain.Actor{}, false
	}
	return actor, true
}

// teamActor resolves the team's club and asks the domain helper, rather than
// trusting that a coach who reached this route belongs on this team.
func (service *service) teamActor(w http.ResponseWriter, r *http.Request, teamID string) (domain.Actor, bool) {
	actor, ok := service.staffActor(w, r)
	if !ok {
		return domain.Actor{}, false
	}
	clubID, err := service.staffStore.ClubOfTeam(r.Context(), teamID)
	if errors.Is(err, store.ErrStaffNotFound) {
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found.")
		return domain.Actor{}, false
	}
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
		return domain.Actor{}, false
	}
	if !domain.CanManageTeam(actor, teamID, clubID) {
		writeError(w, r, http.StatusForbidden, "forbidden", "That team is not yours to manage.")
		return domain.Actor{}, false
	}
	return actor, true
}

// A coach may act on a player who is on one of their teams today, and no other.
func (service *service) playerActor(w http.ResponseWriter, r *http.Request, playerID string) (domain.Actor, bool) {
	actor, ok := service.staffActor(w, r)
	if !ok {
		return domain.Actor{}, false
	}
	clubID, err := service.staffStore.ClubOfPlayer(r.Context(), playerID)
	if errors.Is(err, store.ErrStaffNotFound) {
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found.")
		return domain.Actor{}, false
	}
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
		return domain.Actor{}, false
	}
	teams, err := service.staffStore.TeamsOfPlayer(r.Context(), playerID)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
		return domain.Actor{}, false
	}
	for _, teamID := range teams {
		if domain.CanManageTeam(actor, teamID, clubID) {
			return actor, true
		}
	}
	writeError(w, r, http.StatusForbidden, "forbidden", "That player is not yours to manage.")
	return domain.Actor{}, false
}

func (service *service) staffSearch(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.operatorActor(w, r)
	if !ok {
		return
	}
	_ = actor
	result, err := service.staffStore.Search(r.Context(), r.URL.Query().Get("q"))
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (service *service) listClubs(w http.ResponseWriter, r *http.Request) {
	if _, ok := service.operatorActor(w, r); !ok {
		return
	}
	clubs, err := service.staffStore.ListClubs(r.Context())
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"clubs": clubs})
}

func (service *service) createClub(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.operatorActor(w, r)
	if !ok {
		return
	}
	var request struct {
		Name string `json:"name"`
	}
	if err := decodeStrictJSON(w, r, &request); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The request is invalid.")
		return
	}
	club, err := service.staffStore.CreateClub(r.Context(), request.Name)
	if service.writeStaffStoreError(w, r, err) {
		return
	}
	service.record(r.Context(), actor, "club.create", "club", club.ID, map[string]any{"name": club.Name})
	writeJSON(w, http.StatusCreated, club)
}

func (service *service) listStaffTeams(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.staffActor(w, r)
	if !ok {
		return
	}
	teams, err := service.staffStore.ListTeams(r.Context(), actor)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"teams": teams})
}

func (service *service) createStaffTeam(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.staffActor(w, r)
	if !ok {
		return
	}
	var input store.TeamInput
	if err := decodeStrictJSON(w, r, &input); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The request is invalid.")
		return
	}
	if !domain.CanDeactivateAccount(actor, input.ClubID) {
		writeError(w, r, http.StatusForbidden, "forbidden", "Creating a team needs club or platform authority.")
		return
	}
	team, err := service.staffStore.CreateTeam(r.Context(), input)
	if service.writeStaffStoreError(w, r, err) {
		return
	}
	service.record(r.Context(), actor, "team.create", "team", team.ID,
		map[string]any{"name": team.Name, "timeZone": team.TimeZone, "weeklyGoal": team.WeeklyGoal})
	writeJSON(w, http.StatusCreated, team)
}

func (service *service) getStaffTeam(w http.ResponseWriter, r *http.Request) {
	teamID := r.PathValue("teamId")
	if _, ok := service.teamActor(w, r, teamID); !ok {
		return
	}
	team, err := service.staffStore.Team(r.Context(), teamID)
	if service.writeStaffStoreError(w, r, err) {
		return
	}
	writeJSON(w, http.StatusOK, team)
}

func (service *service) updateStaffTeam(w http.ResponseWriter, r *http.Request) {
	teamID := r.PathValue("teamId")
	actor, ok := service.teamActor(w, r, teamID)
	if !ok {
		return
	}
	if !domain.CanDeactivateAccount(actor, "") && actor.Role != domain.RoleClubAdmin {
		// A coach runs a team; changing its time zone changes what "today"
		// means for every date check on it, which is not a coaching decision.
		writeError(w, r, http.StatusForbidden, "forbidden", "Editing team settings needs club or platform authority.")
		return
	}
	var input store.TeamInput
	if err := decodeStrictJSON(w, r, &input); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The request is invalid.")
		return
	}
	before, err := service.staffStore.Team(r.Context(), teamID)
	if service.writeStaffStoreError(w, r, err) {
		return
	}
	team, err := service.staffStore.UpdateTeam(r.Context(), teamID, input)
	if service.writeStaffStoreError(w, r, err) {
		return
	}
	detail := map[string]any{"name": team.Name, "weeklyGoal": team.WeeklyGoal}
	if before.TimeZone != team.TimeZone {
		detail["timeZoneFrom"], detail["timeZoneTo"] = before.TimeZone, team.TimeZone
	}
	service.record(r.Context(), actor, "team.update", "team", teamID, detail)
	writeJSON(w, http.StatusOK, team)
}

func (service *service) getRoster(w http.ResponseWriter, r *http.Request) {
	teamID := r.PathValue("teamId")
	if _, ok := service.teamActor(w, r, teamID); !ok {
		return
	}
	roster, err := service.staffStore.Roster(r.Context(), teamID)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"roster": roster})
}

func (service *service) startMembership(w http.ResponseWriter, r *http.Request) {
	teamID := r.PathValue("teamId")
	actor, ok := service.teamActor(w, r, teamID)
	if !ok {
		return
	}
	var request struct {
		PlayerID string `json:"playerId"`
	}
	if err := decodeStrictJSON(w, r, &request); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The request is invalid.")
		return
	}
	if err := service.staffStore.StartMembership(r.Context(), teamID, request.PlayerID); service.writeStaffStoreError(w, r, err) {
		return
	}
	service.record(r.Context(), actor, "membership.start", "player", request.PlayerID, map[string]any{"teamId": teamID})
	w.WriteHeader(http.StatusNoContent)
}

func (service *service) endMembership(w http.ResponseWriter, r *http.Request) {
	teamID, playerID := r.PathValue("teamId"), r.PathValue("playerId")
	actor, ok := service.teamActor(w, r, teamID)
	if !ok {
		return
	}
	if err := service.staffStore.EndMembership(r.Context(), teamID, playerID); service.writeStaffStoreError(w, r, err) {
		return
	}
	service.record(r.Context(), actor, "membership.end", "player", playerID, map[string]any{"teamId": teamID})
	w.WriteHeader(http.StatusNoContent)
}

// The PIN and QR are revealed in this response and nowhere else: not in a log,
// not in the audit detail, and not from any endpoint that could be called again
// (SEC-4).
func (service *service) provisionPlayer(w http.ResponseWriter, r *http.Request) {
	teamID := r.PathValue("teamId")
	actor, ok := service.teamActor(w, r, teamID)
	if !ok {
		return
	}
	if !service.cfg.ProductionDataApproved {
		writeError(w, r, http.StatusForbidden, "provisioning_locked",
			"Creating real player accounts is locked until production data is approved.")
		return
	}
	if service.credentials == nil {
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "The service is not ready.")
		return
	}
	var request struct {
		FirstName   string `json:"firstName"`
		LastInitial string `json:"lastInitial"`
	}
	if err := decodeStrictJSON(w, r, &request); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The request is invalid.")
		return
	}
	playerID, accountID, err := service.staffStore.CreatePlayer(r.Context(), teamID, request.FirstName, request.LastInitial)
	if service.writeStaffStoreError(w, r, err) {
		return
	}
	reveal, ok := service.issueLogin(w, r, accountID)
	if !ok {
		return
	}
	service.record(r.Context(), actor, "player.provision", "player", playerID, map[string]any{"teamId": teamID})
	reveal["playerId"], reveal["accountId"] = playerID, accountID
	writeJSON(w, http.StatusCreated, reveal)
}

// F-C7's picker. Any authenticated staff account may read the catalog; only
// teamActor gates actually assigning from it.
func (service *service) getAssignmentCatalog(w http.ResponseWriter, r *http.Request) {
	if _, ok := service.staffActor(w, r); !ok {
		return
	}
	catalog, err := service.staffStore.ListAssignmentCatalog(r.Context())
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"catalog": catalog})
}

// F-C7 and F-C8 on one read: the team's assignment history plus the live
// assignment's Completed / One Away / Keep Going grouping (REQ-506).
// REQ-516. The coach's review of their own team, served from the projection the
// players' own team screen uses -- not a second calculation, so the two screens
// cannot come to different conclusions about who met the weekly goal. Raw
// participation is allowed here because F-C8 grants a coach values on their own
// team; the projection still carries no result value, no assessment, and no
// other team.
func (service *service) getTeamProgress(w http.ResponseWriter, r *http.Request) {
	teamID := r.PathValue("teamId")
	actor, ok := service.teamActor(w, r, teamID)
	if !ok {
		return
	}
	if service.store == nil {
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "The service is not ready.")
		return
	}
	projection, err := service.store.TeamActivity(r.Context(), actor, teamID, service.now().UTC())
	if errors.Is(err, store.ErrSocialTeamUnavailable) {
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found.")
		return
	}
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
		return
	}
	writeJSON(w, http.StatusOK, projection)
}

func (service *service) listAssignments(w http.ResponseWriter, r *http.Request) {
	teamID := r.PathValue("teamId")
	if _, ok := service.teamActor(w, r, teamID); !ok {
		return
	}
	assignments, err := service.staffStore.ListAssignments(r.Context(), teamID)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
		return
	}
	completion, err := service.staffStore.CurrentAssignmentCompletion(r.Context(), teamID)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"assignments": assignments, "current": completion})
}

func (service *service) createAssignment(w http.ResponseWriter, r *http.Request) {
	teamID := r.PathValue("teamId")
	actor, ok := service.teamActor(w, r, teamID)
	if !ok {
		return
	}
	var request struct {
		CatalogKey  string  `json:"catalogKey"`
		TargetValue float64 `json:"targetValue"`
		TargetUnit  string  `json:"targetUnit"`
		StartsOn    string  `json:"startsOn"`
		DueOn       string  `json:"dueOn"`
	}
	if err := decodeStrictJSON(w, r, &request); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The request is invalid.")
		return
	}
	assignmentID, err := service.staffStore.CreateAssignment(r.Context(), teamID, store.AssignmentInput{
		CatalogKey: request.CatalogKey, TargetValue: request.TargetValue, TargetUnit: request.TargetUnit,
		StartsOn: request.StartsOn, DueOn: request.DueOn,
	})
	if service.writeStaffStoreError(w, r, err) {
		return
	}
	service.record(r.Context(), actor, "assignment.create", "assignment", assignmentID, map[string]any{"teamId": teamID})
	writeJSON(w, http.StatusCreated, map[string]any{"id": assignmentID})
}

func (service *service) getPlayerDetail(w http.ResponseWriter, r *http.Request) {
	playerID := r.PathValue("playerId")
	if _, ok := service.playerActor(w, r, playerID); !ok {
		return
	}
	detail, err := service.staffStore.PlayerDetail(r.Context(), playerID)
	if service.writeStaffStoreError(w, r, err) {
		return
	}
	writeJSON(w, http.StatusOK, detail)
}

// F-C6: the flow that turns a lost printout at practice into a two-minute fix.
func (service *service) repairCredential(w http.ResponseWriter, r *http.Request) {
	playerID := r.PathValue("playerId")
	actor, ok := service.playerActor(w, r, playerID)
	if !ok {
		return
	}
	if service.credentials == nil {
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "The service is not ready.")
		return
	}
	var request struct {
		Action string `json:"action"`
	}
	if err := decodeStrictJSON(w, r, &request); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The request is invalid.")
		return
	}
	accountID, err := service.staffStore.AccountOfPlayer(r.Context(), playerID)
	if service.writeStaffStoreError(w, r, err) {
		return
	}
	switch request.Action {
	case "unlock":
		if err = service.staffStore.UnlockCredential(r.Context(), accountID); service.writeStaffStoreError(w, r, err) {
			return
		}
		service.record(r.Context(), actor, "credential.unlock", "player", playerID, nil)
		w.WriteHeader(http.StatusNoContent)
	case "revoke":
		if err = service.credentials.RevokeAccountCredentials(r.Context(), accountID); err != nil {
			writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
			return
		}
		service.record(r.Context(), actor, "credential.revoke", "player", playerID, nil)
		w.WriteHeader(http.StatusNoContent)
	case "reissue":
		reveal, issued := service.issueLogin(w, r, accountID)
		if !issued {
			return
		}
		service.record(r.Context(), actor, "credential.reissue", "player", playerID, nil)
		writeJSON(w, http.StatusCreated, reveal)
	default:
		writeError(w, r, http.StatusBadRequest, "invalid_request", "Choose unlock, reissue, or revoke.")
	}
}

func (service *service) issueLogin(w http.ResponseWriter, r *http.Request, accountID string) (map[string]any, bool) {
	pin, err := authn.GeneratePIN()
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
		return nil, false
	}
	credential, err := service.credentials.IssueCredential(r.Context(), accountID, pin)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
		return nil, false
	}
	reveal := map[string]any{"pin": pin}
	if service.cfg.PlayerLoginURL == "" {
		return reveal, true
	}
	link, err := playerLoginLink(service.cfg.PlayerLoginURL, credential.Token)
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
		return nil, false
	}
	reveal["loginUrl"] = link
	// Rendered here rather than in the browser so the credential is drawn from
	// the same value the server just stored, and no QR library ships to a page
	// that also handles it.
	if png, qrErr := qrcode.Encode(link, qrcode.Medium, 512); qrErr == nil {
		reveal["qrPngBase64"] = base64.StdEncoding.EncodeToString(png)
	}
	return reveal, true
}

func playerLoginLink(raw, token string) (string, error) {
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "https" || parsed.Host == "" || parsed.User != nil {
		return "", errors.New("player login URL must be an absolute https URL")
	}
	parsed.RawFragment = ""
	parsed.Fragment = "credential=" + token
	return parsed.String(), nil
}

// The console's most destructive verb. It needs recent full authentication and
// the player's name typed back, and it erases nothing (F-O9).
func (service *service) deactivatePlayer(w http.ResponseWriter, r *http.Request) {
	playerID := r.PathValue("playerId")
	actor, ok := service.staffActor(w, r)
	if !ok {
		return
	}
	clubID, err := service.staffStore.ClubOfPlayer(r.Context(), playerID)
	if service.writeStaffStoreError(w, r, err) {
		return
	}
	if !domain.CanDeactivateAccount(actor, clubID) {
		writeError(w, r, http.StatusForbidden, "forbidden", "Ending an account needs club or platform authority.")
		return
	}
	if !service.requireStepUp(w, r) {
		return
	}
	var request struct {
		ConfirmName string `json:"confirmName"`
	}
	if err = decodeStrictJSON(w, r, &request); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The request is invalid.")
		return
	}
	detail, err := service.staffStore.PlayerDetail(r.Context(), playerID)
	if service.writeStaffStoreError(w, r, err) {
		return
	}
	expected := strings.TrimSpace(detail.Player.FirstName + " " + detail.Player.LastInitial)
	if !strings.EqualFold(strings.TrimSpace(request.ConfirmName), expected) {
		writeError(w, r, http.StatusUnprocessableEntity, "confirmation_mismatch", "Type the player's name exactly to confirm.")
		return
	}
	accountID, err := service.staffStore.AccountOfPlayer(r.Context(), playerID)
	if service.writeStaffStoreError(w, r, err) {
		return
	}
	if err = service.credentials.RevokeAccountCredentials(r.Context(), accountID); err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
		return
	}
	if err = service.staffStore.DeactivatePlayer(r.Context(), accountID); service.writeStaffStoreError(w, r, err) {
		return
	}
	service.record(r.Context(), actor, "player.deactivate", "player", playerID, nil)
	w.WriteHeader(http.StatusNoContent)
}

func (service *service) listStaffAccounts(w http.ResponseWriter, r *http.Request) {
	if _, ok := service.operatorActor(w, r); !ok {
		return
	}
	if service.staffAccounts == nil {
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "The service is not ready.")
		return
	}
	staff, err := service.staffAccounts.ListStaff(r.Context())
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"staff": staff})
}

func (service *service) createStaffAccount(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.operatorActor(w, r)
	if !ok || service.staffAccounts == nil {
		if ok {
			writeError(w, r, http.StatusServiceUnavailable, "not_ready", "The service is not ready.")
		}
		return
	}
	var request struct {
		Email  string `json:"email"`
		ClubID string `json:"clubId"`
		Role   string `json:"role"`
	}
	if err := decodeStrictJSON(w, r, &request); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The request is invalid.")
		return
	}
	role := domain.Role(request.Role)
	if role == "" {
		role = domain.RoleCoach
	}
	invitation, err := service.staffAccounts.CreateStaffAccount(r.Context(), role, request.ClubID, request.Email, service.cfg.StaffSetupURL)
	if err != nil {
		service.writeStaffAccountError(w, r, err)
		return
	}
	// The email identifies the account; the temporary password is in the
	// response and in no audit row.
	service.record(r.Context(), actor, "staff.create", "account", invitation.AccountID,
		map[string]any{"email": invitation.Email, "role": invitation.Role})
	writeJSON(w, http.StatusCreated, invitation)
}

func (service *service) resetStaffAccount(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.operatorActor(w, r)
	if !ok || service.staffAccounts == nil {
		if ok {
			writeError(w, r, http.StatusServiceUnavailable, "not_ready", "The service is not ready.")
		}
		return
	}
	if !service.requireStepUp(w, r) {
		return
	}
	accountID := r.PathValue("accountId")
	invitation, err := service.staffAccounts.ResetStaffCredential(r.Context(), accountID, service.cfg.StaffSetupURL)
	if err != nil {
		service.writeStaffAccountError(w, r, err)
		return
	}
	service.record(r.Context(), actor, "staff.reset", "account", accountID, nil)
	writeJSON(w, http.StatusCreated, invitation)
}

func (service *service) assignCoach(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.operatorActor(w, r)
	if !ok {
		return
	}
	accountID := r.PathValue("accountId")
	var request struct {
		TeamID string `json:"teamId"`
	}
	if err := decodeStrictJSON(w, r, &request); err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid_request", "The request is invalid.")
		return
	}
	if err := service.staffStore.AssignCoach(r.Context(), accountID, request.TeamID); service.writeStaffStoreError(w, r, err) {
		return
	}
	service.record(r.Context(), actor, "coach.assign", "account", accountID, map[string]any{"teamId": request.TeamID})
	w.WriteHeader(http.StatusNoContent)
}

func (service *service) unassignCoach(w http.ResponseWriter, r *http.Request) {
	actor, ok := service.operatorActor(w, r)
	if !ok {
		return
	}
	accountID, teamID := r.PathValue("accountId"), r.PathValue("teamId")
	if err := service.staffStore.UnassignCoach(r.Context(), accountID, teamID); service.writeStaffStoreError(w, r, err) {
		return
	}
	service.record(r.Context(), actor, "coach.unassign", "account", accountID, map[string]any{"teamId": teamID})
	w.WriteHeader(http.StatusNoContent)
}

func (service *service) getAudit(w http.ResponseWriter, r *http.Request) {
	if _, ok := service.operatorActor(w, r); !ok {
		return
	}
	query := r.URL.Query()
	entries, err := service.staffStore.Audit(r.Context(), store.AuditFilter{
		AccountID: query.Get("accountId"),
		Since:     query.Get("since"),
		Limit:     atoiOrZero(query.Get("limit")),
	})
	if err != nil {
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"events": entries})
}

// requireStepUp is SEC-3's gate. It reads the session's last full
// authentication rather than its age.
func (service *service) requireStepUp(w http.ResponseWriter, r *http.Request) bool {
	if service.staffAccounts == nil {
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "The service is not ready.")
		return false
	}
	token, _ := bearerToken(r)
	if err := service.staffAccounts.RequireRecentAuthentication(r.Context(), token); err != nil {
		writeError(w, r, http.StatusUnauthorized, "step_up_required", "Confirm your password and code to continue.")
		return false
	}
	return true
}

func (service *service) record(ctx context.Context, actor domain.Actor, action, targetType, targetID string, detail map[string]any) {
	_ = service.staffStore.RecordAdminAction(ctx, actor.AccountID, action, targetType, targetID, detail)
}

func (service *service) writeStaffStoreError(w http.ResponseWriter, r *http.Request, err error) bool {
	switch {
	case err == nil:
		return false
	case errors.Is(err, store.ErrStaffNotFound):
		writeError(w, r, http.StatusNotFound, "not_found", "The requested resource was not found.")
	case errors.Is(err, store.ErrStaffInvalid):
		writeError(w, r, http.StatusUnprocessableEntity, "invalid_request", "Check the values and try again.")
	default:
		writeError(w, r, http.StatusInternalServerError, "internal_error", "The request could not be completed.")
	}
	return true
}

func (service *service) writeStaffAccountError(w http.ResponseWriter, r *http.Request, err error) {
	if errors.Is(err, staffauth.ErrEmailInUse) {
		writeError(w, r, http.StatusConflict, "email_in_use", "That email already has a staff account.")
		return
	}
	if errors.Is(err, staffauth.ErrUnavailable) {
		writeError(w, r, http.StatusServiceUnavailable, "not_ready", "Staff accounts are not available.")
		return
	}
	writeError(w, r, http.StatusUnprocessableEntity, "invalid_request", "Check the values and try again.")
}

func atoiOrZero(raw string) int {
	total := 0
	for _, character := range raw {
		if character < '0' || character > '9' {
			return 0
		}
		total = total*10 + int(character-'0')
	}
	return total
}
