package observability

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
	"github.com/prometheus/client_golang/prometheus/testutil"
)

func TestObservedStoreRecordsRealSQLiteOperations(t *testing.T) {
	ctx := context.Background()
	db, err := database.Open(ctx, "file:"+filepath.Join(t.TempDir(), "observability.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if err := database.Migrate(ctx, db); err != nil {
		t.Fatal(err)
	}
	metrics := NewMetrics("test")
	observed := NewObservedStore(store.New(db, time.UTC), metrics)

	if err := observed.Ping(ctx); err != nil {
		t.Fatal(err)
	}

	if got := testutil.ToFloat64(metrics.SQLiteOperations.WithLabelValues("readiness", "success")); got != 1 {
		t.Fatalf("readiness operations = %v, want 1", got)
	}
}
