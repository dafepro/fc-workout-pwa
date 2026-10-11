package database_test

import (
	"context"
	"database/sql"
	"strings"
	"testing"

	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
)

func TestSQLiteInstantComparisonPreservesNanosecondsAndOffsets(t *testing.T) {
	db, err := database.Open(context.Background(), "file:instant-comparison?mode=memory&cache=shared")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	for _, fixture := range []struct {
		name, left, right string
		want              int
	}{
		{"whole before fraction", "2026-08-12T18:00:00Z", "2026-08-12T18:00:00.1Z", -1},
		{"one nanosecond", "2026-08-12T18:00:00.000000001Z", "2026-08-12T18:00:00Z", 1},
		{"different precision", "2026-08-12T18:00:00.10Z", "2026-08-12T18:00:00.1Z", 0},
		{"negative offset", "2026-08-12T13:00:00-05:00", "2026-08-12T18:00:00Z", 0},
		{"positive offset", "2026-08-13T03:00:00+09:00", "2026-08-12T18:00:00Z", 0},
		{"spring gap", "2026-03-08T01:59:59.999999999-06:00", "2026-03-08T03:00:00-05:00", -1},
		{"fall repeated hour", "2026-11-01T01:30:00-05:00", "2026-11-01T01:30:00-06:00", -1},
		{"before Unix epoch", "1900-01-01T00:00:00Z", "2026-01-01T00:00:00Z", -1},
		{"beyond Unix nanoseconds", "9999-12-31T23:59:59Z", "2263-01-01T00:00:00Z", 1},
	} {
		t.Run(fixture.name, func(t *testing.T) {
			var got int
			err := db.QueryRow(`SELECT CASE WHEN zoomigo_instant(?) < zoomigo_instant(?) THEN -1
				WHEN zoomigo_instant(?) > zoomigo_instant(?) THEN 1 ELSE 0 END`, fixture.left, fixture.right, fixture.left, fixture.right).Scan(&got)
			if err != nil || got != fixture.want {
				t.Fatalf("comparison = %d, %v; want %d", got, err, fixture.want)
			}
		})
	}
	var null sql.NullString
	if err := db.QueryRow(`SELECT zoomigo_instant(NULL)`).Scan(&null); err != nil || null.Valid {
		t.Fatalf("NULL = %+v, %v", null, err)
	}
	for _, invalid := range []any{"private-malformed-timestamp", "2026-08-12", 42, "0000-01-01T00:00:00+01:00"} {
		var result string
		err := db.QueryRow(`SELECT zoomigo_instant(?)`, invalid).Scan(&result)
		if err == nil || strings.Contains(err.Error(), "private-malformed-timestamp") {
			t.Fatalf("invalid timestamp did not fail privately: %v", err)
		}
	}
}
