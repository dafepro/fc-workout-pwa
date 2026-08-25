package httpapi_test

import (
	"bytes"
	"context"
	"encoding/json"
	"image"
	"image/color"
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

func TestTeamRewardRoutesAuthorizeStaffAndReturnAPlayerSafeProjection(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(ctx, "file:"+filepath.ToSlash(filepath.Join(t.TempDir(), "rewards-http.db")))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err = database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		`INSERT INTO clubs (id, name, created_at) VALUES ('club-one', 'ZoomiGo Club', '2026-01-01T00:00:00Z')`,
		`INSERT INTO teams (id, club_id, name, season_id, weekly_default_goal, time_zone, created_at) VALUES ('team-one', 'club-one', 'Trailblazers', 'season-2026', 3, 'UTC', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at) VALUES ('player-one', 'club-one', 'One', 'P', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('team-one', 'player-one', '2026-01-01')`,
		`INSERT INTO accounts (id, club_id, role, status, created_at) VALUES ('account-coach', 'club-one', 'coach', 'active', '2026-01-01T00:00:00Z')`,
	} {
		if _, err = db.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	repository := store.New(db, time.UTC)
	mediaFiles, err := rewardmedia.NewFileStore(filepath.Join(t.TempDir(), "reward-media"))
	if err != nil {
		t.Fatal(err)
	}
	staffHandler := httpapi.NewHandler(config.Config{},
		httpapi.WithStore(repository),
		httpapi.WithTeamRewardRepository(repository),
		httpapi.WithTeamRewardMedia(mediaFiles, rewardmedia.NewProcessor()),
		httpapi.WithStaffRepository(store.NewStaffStore(db)),
		httpapi.WithAuthenticator(socialAuthenticator{actor: domain.Actor{
			AccountID: "account-coach", Role: domain.RoleCoach, ClubID: "club-one", AssignedTeamIDs: []string{"team-one"},
		}}),
	)
	uploadBody, uploadType := rewardMediaUpload(t, "image/png", pngRewardImage(t), "prize_image")
	upload := httptest.NewRequest(http.MethodPost, "/v1/staff/teams/team-one/reward-media", uploadBody)
	upload.Header.Set("Authorization", "Bearer staff")
	upload.Header.Set("Content-Type", uploadType)
	uploaded := httptest.NewRecorder()
	staffHandler.ServeHTTP(uploaded, upload)
	if uploaded.Code != http.StatusCreated {
		t.Fatalf("upload status = %d body=%s", uploaded.Code, uploaded.Body.String())
	}
	mediaID := jsonStringField(t, uploaded.Body.String(), "id")
	create := httptest.NewRequest(http.MethodPost, "/v1/staff/teams/team-one/rewards", bytes.NewBufferString(`{
		"prizeTitle":"Pizza after practice 🍕","prizeDescription":"Nine teammates earn pizza 🍕🍕","startsOn":"2026-08-23",
		"mediaId":"`+mediaID+`","rule":{"version":1,"kind":"teammate_consistency","participationScope":"recommended_workout","requiredPlayers":9,"requiredDaysPerPlayer":3}}
	`))
	create.Header.Set("Authorization", "Bearer staff")
	create.Header.Set("Content-Type", "application/json")
	created := httptest.NewRecorder()
	staffHandler.ServeHTTP(created, create)
	if created.Code != http.StatusCreated {
		t.Fatalf("create status = %d body=%s", created.Code, created.Body.String())
	}
	id := jsonStringField(t, created.Body.String(), "id")
	publish := httptest.NewRequest(http.MethodPost, "/v1/staff/teams/team-one/rewards/"+id+"/publish", nil)
	publish.Header.Set("Authorization", "Bearer staff")
	published := httptest.NewRecorder()
	staffHandler.ServeHTTP(published, publish)
	if published.Code != http.StatusOK {
		t.Fatalf("publish status = %d body=%s", published.Code, published.Body.String())
	}
	if !strings.Contains(published.Body.String(), `"requiredPlayers":9`) || !strings.Contains(published.Body.String(), `🍕🍕`) {
		t.Fatalf("published reward omitted configured player target or emoji text: %s", published.Body.String())
	}

	playerHandler := httpapi.NewHandler(config.Config{},
		httpapi.WithStore(repository),
		httpapi.WithTeamRewardRepository(repository),
		httpapi.WithTeamRewardMedia(mediaFiles, rewardmedia.NewProcessor()),
		httpapi.WithAuthenticator(socialAuthenticator{actor: domain.Actor{
			Role: domain.RolePlayer, PlayerID: "player-one", ClubID: "club-one",
		}}),
	)
	get := httptest.NewRequest(http.MethodGet, "/v1/teams/team-one/reward", nil)
	get.Header.Set("Authorization", "Bearer player")
	response := httptest.NewRecorder()
	playerHandler.ServeHTTP(response, get)
	if response.Code != http.StatusOK {
		t.Fatalf("player status = %d body=%s", response.Code, response.Body.String())
	}
	for _, private := range []string{`"createdByAccountId"`, `"days":`, `"activePlayers"`, `"qualifyingPlayers"`} {
		if strings.Contains(response.Body.String(), private) {
			t.Fatalf("player projection leaked %q: %s", private, response.Body.String())
		}
	}
	if !strings.Contains(response.Body.String(), `"mediaId":"`+mediaID+`"`) || !strings.Contains(response.Body.String(), `"imageAlt":"Prize for the team"`) {
		t.Fatalf("player projection omitted safe media metadata: %s", response.Body.String())
	}
	imageRequest := httptest.NewRequest(http.MethodGet, "/v1/teams/team-one/reward-media/"+mediaID+"?variant=thumbnail", nil)
	imageRequest.Header.Set("Authorization", "Bearer player")
	imageResponse := httptest.NewRecorder()
	playerHandler.ServeHTTP(imageResponse, imageRequest)
	if imageResponse.Code != http.StatusOK || imageResponse.Header().Get("Content-Type") != "image/jpeg" {
		t.Fatalf("image status=%d type=%q body=%s", imageResponse.Code, imageResponse.Header().Get("Content-Type"), imageResponse.Body.String())
	}
	imageConfig, format, err := image.DecodeConfig(bytes.NewReader(imageResponse.Body.Bytes()))
	if err != nil || format != "jpeg" || imageConfig.Width != 360 || imageConfig.Height != 240 {
		t.Fatalf("served image = %s %dx%d err=%v", format, imageConfig.Width, imageConfig.Height, err)
	}
	reportRequest := httptest.NewRequest(http.MethodPost, "/v1/teams/team-one/rewards/"+id+"/reports",
		bytes.NewBufferString(`{"reason":"personal_information"}`))
	reportRequest.Header.Set("Authorization", "Bearer player")
	reportRequest.Header.Set("Content-Type", "application/json")
	reportResponse := httptest.NewRecorder()
	playerHandler.ServeHTTP(reportResponse, reportRequest)
	if reportResponse.Code != http.StatusCreated {
		t.Fatalf("report status=%d body=%s", reportResponse.Code, reportResponse.Body.String())
	}
	reportID := jsonStringField(t, reportResponse.Body.String(), "id")

	operatorHandler := httpapi.NewHandler(config.Config{}, httpapi.WithStore(repository),
		httpapi.WithTeamRewardRepository(repository), httpapi.WithStaffRepository(store.NewStaffStore(db)),
		httpapi.WithAuthenticator(socialAuthenticator{actor: domain.Actor{
			AccountID: "account-coach", Role: domain.RolePlatformAdmin,
		}}))
	listReports := httptest.NewRequest(http.MethodGet, "/v1/staff/reward-reports", nil)
	listReports.Header.Set("Authorization", "Bearer operator")
	reportsResponse := httptest.NewRecorder()
	operatorHandler.ServeHTTP(reportsResponse, listReports)
	if reportsResponse.Code != http.StatusOK || !strings.Contains(reportsResponse.Body.String(), `"reason":"personal_information"`) || strings.Contains(reportsResponse.Body.String(), "player-one") {
		t.Fatalf("operator reports status=%d body=%s", reportsResponse.Code, reportsResponse.Body.String())
	}
	resolveRequest := httptest.NewRequest(http.MethodPost, "/v1/staff/reward-reports/"+reportID+"/resolve",
		bytes.NewBufferString(`{"resolution":"hide"}`))
	resolveRequest.Header.Set("Authorization", "Bearer operator")
	resolveRequest.Header.Set("Content-Type", "application/json")
	resolveResponse := httptest.NewRecorder()
	operatorHandler.ServeHTTP(resolveResponse, resolveRequest)
	if resolveResponse.Code != http.StatusOK {
		t.Fatalf("resolve status=%d body=%s", resolveResponse.Code, resolveResponse.Body.String())
	}
	afterHide := httptest.NewRecorder()
	playerHandler.ServeHTTP(afterHide, get)
	if afterHide.Code != http.StatusNoContent {
		t.Fatalf("hidden reward status=%d body=%s", afterHide.Code, afterHide.Body.String())
	}
}

func TestTeamRewardMediaUploadRejectsClaimedTypeMismatch(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(ctx, "file:"+filepath.ToSlash(filepath.Join(t.TempDir(), "rewards-media-http.db")))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err = database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		`INSERT INTO clubs (id, name, created_at) VALUES ('club-one', 'ZoomiGo Club', '2026-01-01T00:00:00Z')`,
		`INSERT INTO teams (id, club_id, name, season_id, weekly_default_goal, time_zone, created_at) VALUES ('team-one', 'club-one', 'Trailblazers', 'season-2026', 3, 'UTC', '2026-01-01T00:00:00Z')`,
		`INSERT INTO accounts (id, club_id, role, status, created_at) VALUES ('account-coach', 'club-one', 'coach', 'active', '2026-01-01T00:00:00Z')`,
	} {
		if _, err = db.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	repository := store.New(db, time.UTC)
	mediaFiles, err := rewardmedia.NewFileStore(filepath.Join(t.TempDir(), "reward-media"))
	if err != nil {
		t.Fatal(err)
	}
	handler := httpapi.NewHandler(config.Config{}, httpapi.WithStore(repository),
		httpapi.WithTeamRewardRepository(repository), httpapi.WithStaffRepository(store.NewStaffStore(db)),
		httpapi.WithTeamRewardMedia(mediaFiles, rewardmedia.NewProcessor()),
		httpapi.WithAuthenticator(socialAuthenticator{actor: domain.Actor{
			AccountID: "account-coach", Role: domain.RoleCoach, ClubID: "club-one", AssignedTeamIDs: []string{"team-one"},
		}}))
	body, contentType := rewardMediaUpload(t, "image/jpeg", pngRewardImage(t), "team_experience")
	request := httptest.NewRequest(http.MethodPost, "/v1/staff/teams/team-one/reward-media", body)
	request.Header.Set("Authorization", "Bearer staff")
	request.Header.Set("Content-Type", contentType)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity || !strings.Contains(response.Body.String(), "reward_media_type_mismatch") {
		t.Fatalf("mismatch status=%d body=%s", response.Code, response.Body.String())
	}
}

func rewardMediaUpload(t *testing.T, claimedType string, contents []byte, altKind string) (*bytes.Buffer, string) {
	t.Helper()
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	if err := writer.WriteField("altKind", altKind); err != nil {
		t.Fatal(err)
	}
	header := make(textproto.MIMEHeader)
	header.Set("Content-Disposition", `form-data; name="image"; filename="reward"`)
	header.Set("Content-Type", claimedType)
	part, err := writer.CreatePart(header)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = part.Write(contents); err != nil {
		t.Fatal(err)
	}
	if err = writer.Close(); err != nil {
		t.Fatal(err)
	}
	return &body, writer.FormDataContentType()
}

func pngRewardImage(t *testing.T) []byte {
	t.Helper()
	value := image.NewRGBA(image.Rect(0, 0, 900, 600))
	for y := 0; y < 600; y++ {
		for x := 0; x < 900; x++ {
			value.Set(x, y, color.RGBA{R: uint8(x % 255), G: uint8(y % 255), B: 120, A: 255})
		}
	}
	var encoded bytes.Buffer
	if err := png.Encode(&encoded, value); err != nil {
		t.Fatal(err)
	}
	return encoded.Bytes()
}

func jsonStringField(t *testing.T, body, field string) string {
	t.Helper()
	var value map[string]any
	if err := json.Unmarshal([]byte(body), &value); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	result, found := value[field].(string)
	if !found || result == "" {
		t.Fatalf("field %q missing from %s", field, body)
	}
	return result
}
