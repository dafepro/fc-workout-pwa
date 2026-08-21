package store_test

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/canvasphysics"
	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func TestTeamCanvasUsesMembershipCompletionAndSafeFields(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	if _, err := db.Exec(`UPDATE players SET avatar_configuration_json = '{"head":"fox"}' WHERE id = 'player-ava'`); err != nil {
		t.Fatal(err)
	}

	projection, err := repository.TeamCanvas(context.Background(), domain.Actor{
		Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one",
	}, "team-one", now)
	if err != nil {
		t.Fatal(err)
	}
	if projection.DayKey != "2026-08-12" || projection.WeekKey != "2026-08-10" {
		t.Fatalf("unexpected calendar keys: %+v", projection)
	}
	if len(projection.Members) != 2 {
		t.Fatalf("members = %+v, want today's two completers", projection.Members)
	}
	if projection.Members[0].PlayerID != "player-ava" || string(projection.Members[0].AvatarConfiguration) != `{"head":"fox"}` {
		t.Fatalf("unexpected first member: %+v", projection.Members[0])
	}
	if len(projection.Members[0].StarDayKeys) != 2 || len(projection.Members[1].StarDayKeys) != 1 {
		t.Fatalf("unexpected star days: %+v", projection.Members)
	}
	encoded, err := json.Marshal(projection)
	if err != nil {
		t.Fatal(err)
	}
	for _, private := range []string{"effortLevel", "exhaustionLevel", "resultValue", "ownerPlayerId"} {
		if strings.Contains(string(encoded), private) {
			t.Fatalf("projection leaked %q: %s", private, encoded)
		}
	}

	if _, err := db.Exec(`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at)
		VALUES ('player-waiting', 'club-one', 'Waiting', 'W', '{}', '2026-01-01T00:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`INSERT INTO team_memberships (team_id, player_id, active_from)
		VALUES ('team-one', 'player-waiting', '2026-01-01')`); err != nil {
		t.Fatal(err)
	}
	_, err = repository.TeamCanvas(context.Background(), domain.Actor{
		Role: domain.RolePlayer, PlayerID: "player-waiting", ClubID: "club-one",
	}, "team-one", now)
	if !errors.Is(err, store.ErrTeamCanvasLocked) {
		t.Fatalf("waiting player error = %v, want locked", err)
	}
}

func TestTeamCanvasPersistsBoundedLivePiecesPositionsAndSettings(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	if _, err := db.Exec(`UPDATE training_entries
		SET assignment_id = 'assignment-hills', result_value = 10
		WHERE id = 'entry-mason'`); err != nil {
		t.Fatal(err)
	}
	actor := domain.Actor{Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one"}

	projection, err := repository.TeamCanvas(context.Background(), actor, "team-one", now)
	if err != nil {
		t.Fatal(err)
	}
	if projection.AvailableRewards != 1 || len(projection.StampChoices) != 5 {
		t.Fatalf("unexpected rewards: %+v", projection)
	}
	piece, err := repository.CreateTeamCanvasPiece(context.Background(), actor, "team-one", projection.StampChoices[0], now)
	if err != nil {
		t.Fatal(err)
	}
	if piece.Status != "live" || !piece.Editable {
		t.Fatalf("created piece = %+v", piece)
	}
	if _, err := repository.CreateTeamCanvasPiece(context.Background(), actor, "team-one", projection.StampChoices[1], now); !errors.Is(err, store.ErrTeamCanvasRewardUnavailable) {
		t.Fatalf("second piece error = %v", err)
	}

	updated, err := repository.UpdateTeamCanvasPiece(context.Background(), actor, "team-one", piece.ID, store.TeamCanvasTransform{
		X: 110, Y: -10, Size: 500, Rotation: 135,
	}, now)
	if err != nil {
		t.Fatal(err)
	}
	if updated.X != 94 || updated.Y != 6 || updated.Size != 76 || updated.Rotation != 135 {
		t.Fatalf("unbounded piece = %+v", updated)
	}
	position, err := repository.UpdateTeamCanvasAvatar(context.Background(), actor, "team-one", store.TeamCanvasPosition{X: -20, Y: 120}, now)
	if err != nil {
		t.Fatal(err)
	}
	if position.X != 6 || position.Y != 94 {
		t.Fatalf("unbounded position = %+v", position)
	}

	settings, err := repository.UpdateTeamCanvasSettings(context.Background(), actor, "team-one", store.TeamCanvasSettingsInput{
		BackgroundAssetID: "creature-quest-town",
		BackgroundColor:   "#DDEEFF",
		TextColor:         "#112233",
		TextSize:          118,
		TextStyle:         "rally",
		StampChoices:      []string{"bolt", "spark-cleat", "zoomigo-mark", "rocket", "star"},
	}, now)
	if err != nil {
		t.Fatal(err)
	}
	if settings.BackgroundAssetID != "creature-quest-town" || settings.TextSize != 118 || settings.StampChoices[1] != "spark-cleat" {
		t.Fatalf("unexpected settings: %+v", settings)
	}

	reloaded, err := repository.TeamCanvas(context.Background(), actor, "team-one", now)
	if err != nil {
		t.Fatal(err)
	}
	if reloaded.AvatarPosition != position || len(reloaded.Pieces) != 1 || reloaded.Settings.BackgroundAssetID != "creature-quest-town" {
		t.Fatalf("durable snapshot mismatch: %+v", reloaded)
	}

	deleted, err := repository.DeleteTrainingEntry(context.Background(), "entry-mason", now)
	if err != nil || !deleted {
		t.Fatalf("delete qualifying entry = %v, %v", deleted, err)
	}
	if err := repository.ReconcileTeamCanvasRewards(context.Background(), "team-one", "player-mason", now); err != nil {
		t.Fatal(err)
	}
	var remaining int
	if err := db.QueryRow(`SELECT COUNT(*) FROM team_canvas_pieces WHERE owner_player_id = 'player-mason'`).Scan(&remaining); err != nil {
		t.Fatal(err)
	}
	if remaining != 0 {
		t.Fatalf("pieces after source deletion = %d, want none", remaining)
	}
}

func TestTeamCanvasDeletesOnlyOwnedCurrentDayPiecesAndReusesRewardSlots(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	if _, err := db.Exec(`UPDATE training_entries
		SET assignment_id = 'assignment-hills', result_value = 10
		WHERE id = 'entry-mason'`); err != nil {
		t.Fatal(err)
	}
	cooldownAt := now.Add(-time.Hour)
	if _, err := db.Exec(`INSERT INTO training_entries (
		id, player_id, team_id, activity_definition_id, occurred_at, result_value,
		result_unit, effort_level, exhaustion_level, created_at, delete_eligible_until
	) VALUES ('entry-mason-cooldown', 'player-mason', 'team-one', 'recovery-walk-jog',
		?, 10, 'minutes', 2, 2, ?, ?)`, cooldownAt.Format(time.RFC3339Nano),
		cooldownAt.Format(time.RFC3339Nano), cooldownAt.Add(24*time.Hour).Format(time.RFC3339Nano)); err != nil {
		t.Fatal(err)
	}
	actor := domain.Actor{Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one"}
	projection, err := repository.TeamCanvas(context.Background(), actor, "team-one", now)
	if err != nil {
		t.Fatal(err)
	}
	if projection.AvailableRewards != 2 {
		t.Fatalf("available rewards = %d, want 2", projection.AvailableRewards)
	}
	first, err := repository.CreateTeamCanvasPiece(context.Background(), actor, "team-one", projection.StampChoices[0], now)
	if err != nil {
		t.Fatal(err)
	}
	second, err := repository.CreateTeamCanvasPiece(context.Background(), actor, "team-one", projection.StampChoices[1], now)
	if err != nil {
		t.Fatal(err)
	}

	if err := repository.DeleteTeamCanvasPiece(context.Background(), actor, "team-one", first.ID, now); err != nil {
		t.Fatal(err)
	}
	afterDelete, err := repository.TeamCanvas(context.Background(), actor, "team-one", now)
	if err != nil {
		t.Fatal(err)
	}
	if afterDelete.AvailableRewards != 1 || len(afterDelete.Pieces) != 1 {
		t.Fatalf("after delete = %+v", afterDelete)
	}
	replacement, err := repository.CreateTeamCanvasPiece(context.Background(), actor, "team-one", projection.StampChoices[2], now)
	if err != nil {
		t.Fatalf("reuse deleted reward slot: %v", err)
	}
	if replacement.AssetID != projection.StampChoices[2] {
		t.Fatalf("replacement = %+v", replacement)
	}

	ava := domain.Actor{Role: domain.RolePlayer, PlayerID: "player-ava", ClubID: "club-one"}
	if err := repository.DeleteTeamCanvasPiece(context.Background(), ava, "team-one", second.ID, now); !errors.Is(err, store.ErrTeamCanvasPieceUnavailable) {
		t.Fatalf("delete another player's piece error = %v", err)
	}
	if err := repository.DeleteTeamCanvasPiece(context.Background(), actor, "team-one", second.ID, now.AddDate(0, 0, 1)); !errors.Is(err, store.ErrTeamCanvasPieceUnavailable) {
		t.Fatalf("delete yesterday's piece error = %v", err)
	}
}

func TestTeamCanvasPersistsVersionedPhysicsCheckpointsAndCascadesDeletion(t *testing.T) {
	repository, db := socialProjectionStore(t)
	now := time.Date(2026, time.August, 12, 18, 0, 0, 0, time.UTC)
	seedSocialProjection(t, db, now)
	if _, err := db.Exec(`UPDATE training_entries
		SET assignment_id = 'assignment-hills', result_value = 10
		WHERE id = 'entry-mason'`); err != nil {
		t.Fatal(err)
	}
	actor := domain.Actor{Role: domain.RolePlayer, PlayerID: "player-mason", ClubID: "club-one"}
	settings, err := repository.UpdateTeamCanvasSettings(context.Background(), actor, "team-one", store.TeamCanvasSettingsInput{
		BackgroundAssetID: "soccer-field", BackgroundColor: "#A8DC9D", TextColor: "#115630",
		TextSize: 112, TextStyle: "block", StampChoices: []string{"soccer", "balloon", "rocket", "bolt", "fire"},
	}, now)
	if err != nil {
		t.Fatal(err)
	}
	if len(settings.StampChoices) != 5 {
		t.Fatalf("settings = %+v", settings)
	}
	piece, err := repository.CreateTeamCanvasPiece(context.Background(), actor, "team-one", "soccer", now)
	if err != nil {
		t.Fatal(err)
	}
	if piece.Physics == nil || piece.Physics.AssetID != "soccer" {
		t.Fatalf("created dynamic piece = %+v", piece)
	}
	checkpoint := canvasphysics.Checkpoint{
		Version: 1, SceneID: "top-down-field", Sequence: 27,
		Bodies: []canvasphysics.BodyState{{
			ID: piece.ID, AssetID: "soccer", Position: canvasphysics.Vector{X: 61, Y: 47},
			Velocity: canvasphysics.Vector{X: 4, Y: -2}, Size: 50, Angle: 33,
		}},
	}
	if err := repository.SaveTeamCanvasPhysicsCheckpoint(context.Background(), "team-one", "2026-08-10", checkpoint, now.Add(time.Second)); err != nil {
		t.Fatal(err)
	}
	reloaded, err := repository.TeamCanvas(context.Background(), actor, "team-one", now)
	if err != nil {
		t.Fatal(err)
	}
	if reloaded.Physics.SceneID != "top-down-field" || reloaded.Physics.Sequence != 27 ||
		len(reloaded.Pieces) != 1 || reloaded.Pieces[0].Physics == nil ||
		reloaded.Pieces[0].X != 61 || reloaded.Pieces[0].Rotation != 33 ||
		reloaded.Pieces[0].Physics.Velocity.X != 4 {
		t.Fatalf("reloaded physics projection = %+v", reloaded)
	}
	_, err = repository.UpdateTeamCanvasSettings(context.Background(), actor, "team-one", store.TeamCanvasSettingsInput{
		BackgroundAssetID: "cosmic-stadium", BackgroundColor: "#111827", TextColor: "#FFFFFF",
		TextSize: 112, TextStyle: "block", StampChoices: []string{"soccer", "balloon", "rocket", "bolt", "fire"},
	}, now.Add(2*time.Second))
	if err != nil {
		t.Fatal(err)
	}
	if err = repository.SaveTeamCanvasPhysicsCheckpoint(context.Background(), "team-one", "2026-08-10", checkpoint, now.Add(3*time.Second)); err == nil {
		t.Fatal("stale scene checkpoint was accepted after the background changed")
	}
	if err := repository.DeleteTeamCanvasPiece(context.Background(), actor, "team-one", piece.ID, now); err != nil {
		t.Fatal(err)
	}
	var states int
	if err := db.QueryRow(`SELECT COUNT(*) FROM team_canvas_piece_states WHERE piece_id = ?`, piece.ID).Scan(&states); err != nil || states != 0 {
		t.Fatalf("piece physics survived delete: count=%d err=%v", states, err)
	}
}
