package httpapi_test

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"image"
	"image/png"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/httpapi"
	"github.com/dafepro/fc-workout-pwa/backend/internal/rewardmedia"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func TestTeamRewardRoutesPublishIdempotentlyAndExposeSafeAggregateReads(t *testing.T) {
	db := teamRewardHTTPDB(t)
	staff := store.NewStaffStore(db)
	playerStore := store.New(db, time.UTC)
	coach := domain.Actor{
		AccountID: "account-coach", Role: domain.RoleCoach, ClubID: "club-one",
		AssignedTeamIDs: []string{"team-one"},
	}
	staffHandler := httpapi.NewHandler(config.Config{},
		httpapi.WithStore(playerStore), httpapi.WithStaffRepository(staff),
		httpapi.WithAuthenticator(socialAuthenticator{actor: coach}),
	)
	definitions := teamRewardRequest(staffHandler, http.MethodGet, "/v1/staff/team-reward-definitions", "", "")
	if definitions.Code != http.StatusOK || !strings.Contains(definitions.Body.String(), `"id":"team-celebration-v1"`) {
		t.Fatalf("definitions status=%d body=%s", definitions.Code, definitions.Body.String())
	}
	today := time.Now().UTC().Truncate(24 * time.Hour)
	body := fmt.Sprintf(`{"definitionId":"team-celebration-v1","title":"Pizza party","description":"Celebrate together after practice.","startsOn":"%s","endsOn":"%s","requiredDays":2,"minimumRosterPercent":60}`,
		today.Format("2006-01-02"), today.AddDate(0, 0, 2).Format("2006-01-02"))

	published := teamRewardRequest(staffHandler, http.MethodPost, "/v1/staff/teams/team-one/team-reward", body, "publish-key")
	if published.Code != http.StatusCreated || !strings.Contains(published.Body.String(), `"title":"Pizza party"`) {
		t.Fatalf("publish status=%d body=%s", published.Code, published.Body.String())
	}
	var publishedReward store.TeamReward
	if err := json.Unmarshal(published.Body.Bytes(), &publishedReward); err != nil || publishedReward.ID == "" {
		t.Fatalf("decode published reward: %+v, %v", publishedReward, err)
	}
	replayed := teamRewardRequest(staffHandler, http.MethodPost, "/v1/staff/teams/team-one/team-reward", body, "publish-key")
	if replayed.Code != http.StatusOK || replayed.Body.String() != published.Body.String() {
		t.Fatalf("replay status=%d body=%s want=%s", replayed.Code, replayed.Body.String(), published.Body.String())
	}
	staffRead := teamRewardRequest(staffHandler, http.MethodGet, "/v1/staff/teams/team-one/team-reward", "", "")
	if staffRead.Code != http.StatusOK || !strings.Contains(staffRead.Body.String(), `"activePlayers":1`) {
		t.Fatalf("staff read status=%d body=%s", staffRead.Code, staffRead.Body.String())
	}

	legacyPlayerRead := teamRewardRequest(staffHandler, http.MethodGet, "/v1/teams/team-one/team-reward", "", "")
	if legacyPlayerRead.Code != http.StatusNotFound {
		t.Fatalf("legacy player route status=%d body=%s", legacyPlayerRead.Code, legacyPlayerRead.Body.String())
	}
	cancelPath := "/v1/staff/teams/team-one/team-reward/" + publishedReward.ID + "/cancel"
	cancelled := teamRewardRequest(staffHandler, http.MethodPost, cancelPath, "", "")
	if cancelled.Code != http.StatusOK || !strings.Contains(cancelled.Body.String(), `"status":"cancelled"`) {
		t.Fatalf("cancel status=%d body=%s", cancelled.Code, cancelled.Body.String())
	}
	stale := teamRewardRequest(staffHandler, http.MethodPost, cancelPath, "", "")
	if stale.Code != http.StatusConflict || !strings.Contains(stale.Body.String(), `"team_reward_changed"`) {
		t.Fatalf("stale cancel status=%d body=%s", stale.Code, stale.Body.String())
	}
}

func TestTeamRewardAuthoringRoutesAreProductionAndTeamAuthorized(t *testing.T) {
	db := teamRewardHTTPDB(t)
	staff := store.NewStaffStore(db)
	playerStore := store.New(db, time.UTC)
	production := httpapi.NewHandler(config.Config{}, httpapi.WithStore(playerStore),
		httpapi.WithStaffRepository(staff), httpapi.WithAuthenticator(socialAuthenticator{actor: domain.Actor{
			AccountID: "account-coach", Role: domain.RoleCoach, ClubID: "club-one", AssignedTeamIDs: []string{"team-one"},
		}}),
	)
	definitions := teamRewardRequest(production, http.MethodGet, "/v1/staff/team-reward-definitions", "", "")
	if definitions.Code != http.StatusOK {
		t.Fatalf("production definitions status=%d body=%s", definitions.Code, definitions.Body.String())
	}

	unassigned := httpapi.NewHandler(config.Config{EnableDevAccess: true}, httpapi.WithStore(playerStore),
		httpapi.WithStaffRepository(staff), httpapi.WithAuthenticator(socialAuthenticator{actor: domain.Actor{
			AccountID: "account-coach", Role: domain.RoleCoach, ClubID: "club-one",
		}}),
	)
	today := time.Now().UTC().Truncate(24 * time.Hour)
	body := fmt.Sprintf(`{"definitionId":"team-celebration-v1","startsOn":"%s","endsOn":"%s","requiredDays":1,"minimumRosterPercent":60}`,
		today.Format("2006-01-02"), today.AddDate(0, 0, 1).Format("2006-01-02"))
	response := teamRewardRequest(unassigned, http.MethodPost, "/v1/staff/teams/team-one/team-reward", body, "key")
	if response.Code != http.StatusForbidden {
		t.Fatalf("unassigned publish status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestTeamRewardImageUploadIsPrivateAndVisibleWithPublishedReward(t *testing.T) {
	db := teamRewardHTTPDB(t)
	staff := store.NewStaffStore(db)
	files, err := rewardmedia.NewFileStore(filepath.Join(t.TempDir(), "reward-media"))
	if err != nil {
		t.Fatal(err)
	}
	coach := domain.Actor{AccountID: "account-coach", Role: domain.RoleCoach, ClubID: "club-one", AssignedTeamIDs: []string{"team-one"}}
	coachHandler := httpapi.NewHandler(config.Config{}, httpapi.WithStore(store.New(db, time.UTC)),
		httpapi.WithStaffRepository(staff), httpapi.WithAuthenticator(socialAuthenticator{actor: coach}),
		httpapi.WithTeamRewardMedia(files, rewardmedia.NewProcessor()))

	var upload bytes.Buffer
	form := multipart.NewWriter(&upload)
	part, err := form.CreatePart(textproto.MIMEHeader{
		"Content-Disposition": {`form-data; name="image"; filename="prize.png"`},
		"Content-Type":        {"image/png"},
	})
	if err != nil {
		t.Fatal(err)
	}
	if err = png.Encode(part, image.NewRGBA(image.Rect(0, 0, 32, 32))); err != nil {
		t.Fatal(err)
	}
	if err = form.WriteField("altKind", "prize_image"); err != nil {
		t.Fatal(err)
	}
	if err = form.Close(); err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodPost, "/v1/staff/teams/team-one/reward-media", &upload)
	request.Header.Set("Authorization", "Bearer test")
	request.Header.Set("Content-Type", form.FormDataContentType())
	response := httptest.NewRecorder()
	coachHandler.ServeHTTP(response, request)
	if response.Code != http.StatusCreated {
		t.Fatalf("upload status=%d body=%s", response.Code, response.Body.String())
	}
	var media store.TeamRewardMedia
	if err = json.Unmarshal(response.Body.Bytes(), &media); err != nil || media.ID == "" {
		t.Fatalf("decode media: %+v err=%v", media, err)
	}

	today := time.Now().UTC().Format(time.DateOnly)
	publishBody := fmt.Sprintf(`{"definitionId":"team-celebration-v1","title":"Pizza party","description":"Celebrate together.","mediaId":%q,"startsOn":%q,"endsOn":%q,"requiredDays":1,"minimumRosterPercent":60}`,
		media.ID, today, today)
	published := teamRewardRequest(coachHandler, http.MethodPost, "/v1/staff/teams/team-one/team-reward", publishBody, "publish-with-image")
	if published.Code != http.StatusCreated {
		t.Fatalf("publish status=%d body=%s", published.Code, published.Body.String())
	}

	player := domain.Actor{AccountID: "account-player", PlayerID: "player-one", Role: domain.RolePlayer, ClubID: "club-one"}
	playerHandler := httpapi.NewHandler(config.Config{}, httpapi.WithStore(store.New(db, time.UTC)),
		httpapi.WithStaffRepository(staff), httpapi.WithAuthenticator(socialAuthenticator{actor: player}),
		httpapi.WithTeamRewardMedia(files, rewardmedia.NewProcessor()))
	imageResponse := teamRewardRequest(playerHandler, http.MethodGet,
		"/v1/teams/team-one/reward-media/"+media.ID, "", "")
	if imageResponse.Code != http.StatusOK || imageResponse.Header().Get("Content-Type") != "image/jpeg" || imageResponse.Body.Len() == 0 {
		t.Fatalf("player image status=%d type=%q bytes=%d", imageResponse.Code, imageResponse.Header().Get("Content-Type"), imageResponse.Body.Len())
	}
}

func teamRewardHTTPDB(t *testing.T) *sql.DB {
	t.Helper()
	ctx := context.Background()
	db, err := database.Open(ctx, "file:"+filepath.ToSlash(filepath.Join(t.TempDir(), "team-rewards-http.db")))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err = database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		`INSERT INTO clubs (id, name, created_at) VALUES ('club-one', 'Club', '2026-01-01T00:00:00Z')`,
		`INSERT INTO teams (id, club_id, name, season_id, weekly_default_goal, time_zone, created_at)
		 VALUES ('team-one', 'club-one', 'Team', 'season-one', 3, 'UTC', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at)
		 VALUES ('player-one', 'club-one', 'Ava', 'R', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO team_memberships (team_id, player_id, active_from)
		 VALUES ('team-one', 'player-one', '2026-01-01')`,
		`INSERT INTO accounts (id, club_id, role, status, created_at)
		 VALUES ('account-coach', 'club-one', 'coach', 'active', '2026-01-01T00:00:00Z')`,
	} {
		if _, err = db.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	return db
}

func teamRewardRequest(handler http.Handler, method, path, body, key string) *httptest.ResponseRecorder {
	var request *http.Request
	if body == "" {
		request = httptest.NewRequest(method, path, nil)
	} else {
		request = httptest.NewRequest(method, path, bytes.NewBufferString(body))
		request.Header.Set("Content-Type", "application/json")
	}
	request.Header.Set("Authorization", "Bearer test")
	if key != "" {
		request.Header.Set("Idempotency-Key", key)
	}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	return response
}
