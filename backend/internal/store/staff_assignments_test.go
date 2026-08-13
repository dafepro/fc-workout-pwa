package store_test

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

// REQ-505: only an approved catalog entry may become an assignment, and the
// window is validated as team-local calendar dates.
func TestCreateAssignmentValidatesCatalogAndWindow(t *testing.T) {
	staff, teamID, _ := assignmentStaffStore(t)
	ctx := context.Background()

	if _, err := staff.CreateAssignment(ctx, teamID, store.AssignmentInput{
		CatalogKey: "not_a_real_key", TargetValue: 6, TargetUnit: "reps",
		StartsOn: "2026-01-01", DueOn: "2026-01-07",
	}); !errors.Is(err, store.ErrStaffInvalid) {
		t.Fatalf("unknown catalog key error = %v, want ErrStaffInvalid", err)
	}

	if _, err := staff.CreateAssignment(ctx, teamID, store.AssignmentInput{
		CatalogKey: "hill_sprints_8x6", TargetValue: 0, TargetUnit: "reps",
		StartsOn: "2026-01-01", DueOn: "2026-01-07",
	}); !errors.Is(err, store.ErrStaffInvalid) {
		t.Fatalf("non-positive target error = %v, want ErrStaffInvalid", err)
	}

	if _, err := staff.CreateAssignment(ctx, teamID, store.AssignmentInput{
		CatalogKey: "hill_sprints_8x6", TargetValue: 6, TargetUnit: "reps",
		StartsOn: "2026-01-10", DueOn: "2026-01-01",
	}); !errors.Is(err, store.ErrStaffInvalid) {
		t.Fatalf("due-before-start error = %v, want ErrStaffInvalid", err)
	}

	id, err := staff.CreateAssignment(ctx, teamID, store.AssignmentInput{
		CatalogKey: "hill_sprints_8x6", TargetValue: 6, TargetUnit: "reps",
		StartsOn: "2026-01-01", DueOn: "2026-01-07",
	})
	if err != nil || id == "" {
		t.Fatalf("create assignment: id=%q err=%v", id, err)
	}

	assignments, err := staff.ListAssignments(ctx, teamID)
	if err != nil {
		t.Fatal(err)
	}
	if len(assignments) != 1 || assignments[0].ID != id || assignments[0].ActivityName != "Hill Sprints" {
		t.Fatalf("unexpected assignment list: %+v", assignments)
	}
}

// REQ-512: the catalog is the coach's preset list, so every approved activity
// is represented, and entries arrive grouped by activity in the same order the
// player's own picker uses (activity id), cheapest preset first.
func TestListAssignmentCatalogCoversEveryActivityInPickerOrder(t *testing.T) {
	staff, _, _ := assignmentStaffStore(t)
	catalog, err := staff.ListAssignmentCatalog(context.Background())
	if err != nil {
		t.Fatal(err)
	}

	got := make([]string, len(catalog))
	activities := map[string]bool{}
	for index, entry := range catalog {
		got[index] = entry.Key
		activities[entry.ActivityDefinitionID] = true
	}
	want := []string{
		"distance_run_1mi", "distance_run_2mi",
		"hill_sprints_8x6",
		"recovery_20",
		"timed_run_20", "timed_run_30",
	}
	if len(got) != len(want) {
		t.Fatalf("catalog = %v, want %v", got, want)
	}
	for index, key := range want {
		if got[index] != key {
			t.Fatalf("catalog = %v, want %v", got, want)
		}
	}
	if len(activities) != 4 {
		t.Fatalf("catalog covers %d activities, want all 4: %v", len(activities), got)
	}
}

// An unapproved entry is one awaiting review, and must never be assignable.
func TestListAssignmentCatalogOmitsUnapprovedEntries(t *testing.T) {
	staff, _, db := assignmentStaffStore(t)
	if _, err := db.ExecContext(context.Background(), `INSERT INTO assignment_catalog
		(key, display_name, activity_definition_id, default_target_value, default_target_unit, approved)
		VALUES ('pending_review', 'Pending', 'hill-sprints', 4, 'reps', 0)`); err != nil {
		t.Fatal(err)
	}
	catalog, err := staff.ListAssignmentCatalog(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range catalog {
		if entry.Key == "pending_review" {
			t.Fatal("an unapproved catalog entry must not be assignable")
		}
	}
}

// REQ-506: a player who met the target is Completed, one who logged an entry
// against the assignment without meeting it is One Away, and a player with no
// entry at all is Keep Going.
func TestCurrentAssignmentCompletionGroupsByProgress(t *testing.T) {
	staff, teamID, db := assignmentStaffStore(t)
	ctx := context.Background()
	today := time.Now().UTC()
	startsOn := today.AddDate(0, 0, -3).Format("2006-01-02")
	dueOn := today.AddDate(0, 0, 3).Format("2006-01-02")

	assignmentID, err := staff.CreateAssignment(ctx, teamID, store.AssignmentInput{
		CatalogKey: "hill_sprints_8x6", TargetValue: 6, TargetUnit: "reps",
		StartsOn: startsOn, DueOn: dueOn,
	})
	if err != nil {
		t.Fatal(err)
	}

	empty, err := staff.CurrentAssignmentCompletion(ctx, teamID)
	if err != nil {
		t.Fatal(err)
	}
	if empty.Assignment == nil || empty.Assignment.ID != assignmentID {
		t.Fatalf("unexpected live assignment: %+v", empty.Assignment)
	}
	if len(empty.Completed) != 0 || len(empty.OneAway) != 0 || len(empty.KeepGoing) != 3 {
		t.Fatalf("unexpected initial grouping: completed=%d oneAway=%d keepGoing=%d",
			len(empty.Completed), len(empty.OneAway), len(empty.KeepGoing))
	}

	seedTrainingEntry(t, db, "entry-met", "player-met", assignmentID, teamID, 6, today.Add(-time.Hour))
	seedTrainingEntry(t, db, "entry-started", "player-started", assignmentID, teamID, 3, today.Add(-2*time.Hour))

	completion, err := staff.CurrentAssignmentCompletion(ctx, teamID)
	if err != nil {
		t.Fatal(err)
	}
	if len(completion.Completed) != 1 || completion.Completed[0].PlayerID != "player-met" {
		t.Fatalf("unexpected completed group: %+v", completion.Completed)
	}
	if len(completion.OneAway) != 1 || completion.OneAway[0].PlayerID != "player-started" {
		t.Fatalf("unexpected one-away group: %+v", completion.OneAway)
	}
	if len(completion.KeepGoing) != 1 || completion.KeepGoing[0].PlayerID != "player-not-started" {
		t.Fatalf("unexpected keep-going group: %+v", completion.KeepGoing)
	}
}

// REQ-513: a coach who typed the wrong target or the wrong week can amend the
// assignment rather than living with it. The activity is not amendable -- to
// change what is being asked for, delete an assignment that has not started.
func TestUpdateAssignmentAmendsTargetAndWindow(t *testing.T) {
	staff, teamID, _ := assignmentStaffStore(t)
	ctx := context.Background()
	today := time.Now().UTC()
	future := today.AddDate(0, 0, 5).Format("2006-01-02")
	laterFuture := today.AddDate(0, 0, 9).Format("2006-01-02")

	id, err := staff.CreateAssignment(ctx, teamID, store.AssignmentInput{
		CatalogKey: "hill_sprints_8x6", TargetValue: 6, TargetUnit: "reps",
		StartsOn: future, DueOn: laterFuture,
	})
	if err != nil {
		t.Fatal(err)
	}

	if err = staff.UpdateAssignment(ctx, teamID, id, store.AssignmentUpdate{
		TargetValue: 8, TargetUnit: "reps", StartsOn: future, DueOn: laterFuture,
	}); err != nil {
		t.Fatalf("amend target: %v", err)
	}

	assignments, err := staff.ListAssignments(ctx, teamID)
	if err != nil {
		t.Fatal(err)
	}
	if len(assignments) != 1 || assignments[0].TargetValue != 8 {
		t.Fatalf("unexpected assignment after amendment: %+v", assignments)
	}

	if err = staff.UpdateAssignment(ctx, teamID, id, store.AssignmentUpdate{
		TargetValue: 8, TargetUnit: "reps", StartsOn: laterFuture, DueOn: future,
	}); !errors.Is(err, store.ErrStaffInvalid) {
		t.Fatalf("due-before-start error = %v, want ErrStaffInvalid", err)
	}

	if err = staff.UpdateAssignment(ctx, teamID, "assignment-elsewhere", store.AssignmentUpdate{
		TargetValue: 8, TargetUnit: "reps", StartsOn: future, DueOn: laterFuture,
	}); !errors.Is(err, store.ErrStaffNotFound) {
		t.Fatalf("unknown assignment error = %v, want ErrStaffNotFound", err)
	}
}

// A start date is a fact about the past once it has passed, and moving it would
// silently change which entries counted. Ending it early is the verb instead.
func TestUpdateAssignmentRefusesToMoveAStartThatHasPassed(t *testing.T) {
	staff, teamID, _ := assignmentStaffStore(t)
	ctx := context.Background()
	today := time.Now().UTC()
	startsOn := today.AddDate(0, 0, -3).Format("2006-01-02")
	dueOn := today.AddDate(0, 0, 3).Format("2006-01-02")

	id, err := staff.CreateAssignment(ctx, teamID, store.AssignmentInput{
		CatalogKey: "hill_sprints_8x6", TargetValue: 6, TargetUnit: "reps",
		StartsOn: startsOn, DueOn: dueOn,
	})
	if err != nil {
		t.Fatal(err)
	}

	if err = staff.UpdateAssignment(ctx, teamID, id, store.AssignmentUpdate{
		TargetValue: 6, TargetUnit: "reps",
		StartsOn: today.AddDate(0, 0, -1).Format("2006-01-02"), DueOn: dueOn,
	}); !errors.Is(err, store.ErrAssignmentStarted) {
		t.Fatalf("moving a passed start error = %v, want ErrAssignmentStarted", err)
	}

	// The window's other end still moves: shortening a live week is allowed.
	if err = staff.UpdateAssignment(ctx, teamID, id, store.AssignmentUpdate{
		TargetValue: 6, TargetUnit: "reps", StartsOn: startsOn,
		DueOn: today.AddDate(0, 0, 1).Format("2006-01-02"),
	}); err != nil {
		t.Fatalf("shorten a live window: %v", err)
	}
}

// REQ-514: delete is for an assignment created by mistake, which is one nobody
// has trained against yet. Once it is live, or once a reaction points at it,
// deleting would take a player's own history with it.
func TestDeleteAssignmentOnlyBeforeItHasStarted(t *testing.T) {
	staff, teamID, db := assignmentStaffStore(t)
	ctx := context.Background()
	today := time.Now().UTC()
	future := today.AddDate(0, 0, 5).Format("2006-01-02")

	mistake, err := staff.CreateAssignment(ctx, teamID, store.AssignmentInput{
		CatalogKey: "hill_sprints_8x6", TargetValue: 6, TargetUnit: "reps",
		StartsOn: future, DueOn: future,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err = staff.DeleteAssignment(ctx, teamID, mistake); err != nil {
		t.Fatalf("delete an assignment that has not started: %v", err)
	}
	if err = staff.DeleteAssignment(ctx, teamID, mistake); !errors.Is(err, store.ErrStaffNotFound) {
		t.Fatalf("second delete error = %v, want ErrStaffNotFound", err)
	}

	live, err := staff.CreateAssignment(ctx, teamID, store.AssignmentInput{
		CatalogKey: "hill_sprints_8x6", TargetValue: 6, TargetUnit: "reps",
		StartsOn: today.AddDate(0, 0, -1).Format("2006-01-02"), DueOn: future,
	})
	if err != nil {
		t.Fatal(err)
	}
	if err = staff.DeleteAssignment(ctx, teamID, live); !errors.Is(err, store.ErrAssignmentStarted) {
		t.Fatalf("delete a live assignment error = %v, want ErrAssignmentStarted", err)
	}

	// A reaction referencing it is the harder case: the row is a foreign key
	// parent, so the delete would either fail or take the reaction with it.
	unstarted, err := staff.CreateAssignment(ctx, teamID, store.AssignmentInput{
		CatalogKey: "hill_sprints_8x6", TargetValue: 6, TargetUnit: "reps",
		StartsOn: future, DueOn: future,
	})
	if err != nil {
		t.Fatal(err)
	}
	seedChallengeReaction(t, db, unstarted, teamID)
	if err = staff.DeleteAssignment(ctx, teamID, unstarted); !errors.Is(err, store.ErrAssignmentStarted) {
		t.Fatalf("delete a reacted-to assignment error = %v, want ErrAssignmentStarted", err)
	}
}

// The verb that always works: end it today, in the team's own time zone.
func TestEndAssignmentClosesTheWindowToday(t *testing.T) {
	staff, teamID, _ := assignmentStaffStore(t)
	ctx := context.Background()
	today := time.Now().UTC()
	startsOn := today.AddDate(0, 0, -2).Format("2006-01-02")

	id, err := staff.CreateAssignment(ctx, teamID, store.AssignmentInput{
		CatalogKey: "hill_sprints_8x6", TargetValue: 6, TargetUnit: "reps",
		StartsOn: startsOn, DueOn: today.AddDate(0, 0, 10).Format("2006-01-02"),
	})
	if err != nil {
		t.Fatal(err)
	}

	dueOn, err := staff.EndAssignment(ctx, teamID, id)
	if err != nil {
		t.Fatalf("end early: %v", err)
	}
	if dueOn != today.Format("2006-01-02") {
		t.Fatalf("dueOn = %q, want today in the team's zone", dueOn)
	}

	assignments, err := staff.ListAssignments(ctx, teamID)
	if err != nil {
		t.Fatal(err)
	}
	if len(assignments) != 1 || assignments[0].DueOn != dueOn {
		t.Fatalf("unexpected assignment after ending early: %+v", assignments)
	}

	// Nothing to end early about a week that has not begun; delete it instead.
	future := today.AddDate(0, 0, 5).Format("2006-01-02")
	notYet, err := staff.CreateAssignment(ctx, teamID, store.AssignmentInput{
		CatalogKey: "hill_sprints_8x6", TargetValue: 6, TargetUnit: "reps",
		StartsOn: future, DueOn: future,
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err = staff.EndAssignment(ctx, teamID, notYet); !errors.Is(err, store.ErrStaffInvalid) {
		t.Fatalf("end an unstarted assignment error = %v, want ErrStaffInvalid", err)
	}
}

func seedChallengeReaction(t *testing.T, db *sql.DB, assignmentID, teamID string) {
	t.Helper()
	if _, err := db.ExecContext(context.Background(), `INSERT INTO reactions (
		id, sender_player_id, recipient_player_id, team_id, reaction_type,
		context_type, context_assignment_id, team_day, idempotency_key, created_at
	) VALUES ('reaction-1', 'player-met', 'player-started', ?, 'clap',
		'challenge', ?, '2026-01-05', 'idem-1', '2026-01-05T00:00:00Z')`,
		teamID, assignmentID); err != nil {
		t.Fatal(err)
	}
}

func assignmentStaffStore(t *testing.T) (*store.StaffStore, string, *sql.DB) {
	t.Helper()
	db := assignmentDB(t, "team-assignments")
	return store.NewStaffStore(db), "team-assignments", db
}

func assignmentDB(t *testing.T, teamID string) *sql.DB {
	t.Helper()
	ctx := context.Background()
	databaseURL := "file:" + filepath.ToSlash(filepath.Join(t.TempDir(), teamID+".db"))
	db, err := database.Open(ctx, databaseURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err = database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}

	for _, statement := range []string{
		`INSERT INTO clubs (id, name, created_at) VALUES ('club-assignments', 'Club', '2026-01-01T00:00:00Z')`,
		`INSERT INTO teams (id, club_id, name, season_id, weekly_default_goal, time_zone, created_at)
		 VALUES ('` + teamID + `', 'club-assignments', 'Team', 'season-2026', 3, 'UTC', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at)
		 VALUES ('player-met', 'club-assignments', 'Met', 'A', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at)
		 VALUES ('player-started', 'club-assignments', 'Started', 'B', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO players (id, club_id, first_name, last_initial, avatar_configuration_json, created_at)
		 VALUES ('player-not-started', 'club-assignments', 'NotStarted', 'C', '{}', '2026-01-01T00:00:00Z')`,
		`INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('` + teamID + `', 'player-met', '2026-01-01')`,
		`INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('` + teamID + `', 'player-started', '2026-01-01')`,
		`INSERT INTO team_memberships (team_id, player_id, active_from) VALUES ('` + teamID + `', 'player-not-started', '2026-01-01')`,
	} {
		if _, err = db.ExecContext(ctx, statement); err != nil {
			t.Fatal(err)
		}
	}
	return db
}

func seedTrainingEntry(t *testing.T, db *sql.DB, id, playerID, assignmentID, teamID string, resultValue float64, when time.Time) {
	t.Helper()
	stamp := when.UTC().Format(time.RFC3339Nano)
	if _, err := db.ExecContext(context.Background(), `INSERT INTO training_entries (
		id, player_id, team_id, activity_definition_id, assignment_id, occurred_at, result_value,
		result_unit, effort_level, exhaustion_level, created_at, delete_eligible_until
	) VALUES (?, ?, ?, 'hill-sprints', ?, ?, ?, 'reps', 3, 3, ?, ?)`,
		id, playerID, teamID, assignmentID, stamp, resultValue, stamp,
		when.Add(24*time.Hour).UTC().Format(time.RFC3339Nano)); err != nil {
		t.Fatal(err)
	}
}
