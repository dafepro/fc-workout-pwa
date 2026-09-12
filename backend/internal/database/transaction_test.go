package database_test

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/database"
)

func TestRequestTransactionJoinsRepositoriesAndNestedSavepoints(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), 3*time.Second)
	defer cancel()
	db, err := database.Open(ctx, "file:"+filepath.ToSlash(filepath.Join(t.TempDir(), "transaction.db")))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err = db.ExecContext(ctx, `CREATE TABLE effects(value TEXT)`); err != nil {
		t.Fatal(err)
	}
	first, second := database.NewHandle(db), database.NewHandle(db)
	for _, failOuter := range []bool{true, false} {
		err = first.WithinTransaction(ctx, func(ctx context.Context) error {
			if _, err := first.ExecContext(ctx, `INSERT INTO effects VALUES('outer')`); err != nil {
				return err
			}
			nested, err := second.BeginTx(ctx, nil)
			if err != nil {
				return err
			}
			if _, err = nested.ExecContext(ctx, `INSERT INTO effects VALUES('discarded')`); err != nil {
				return err
			}
			if err = nested.Rollback(); err != nil {
				return err
			}
			nested, err = second.BeginTx(ctx, nil)
			if err != nil {
				return err
			}
			defer nested.Rollback()
			if _, err = nested.ExecContext(ctx, `INSERT INTO effects VALUES('nested')`); err != nil {
				return err
			}
			if err = nested.Commit(); err != nil {
				return err
			}
			var count int
			if err = first.QueryRowContext(ctx, `SELECT COUNT(*) FROM effects`).Scan(&count); err != nil {
				return err
			}
			if count != 2 {
				t.Fatalf("nested savepoint visibility count=%d", count)
			}
			if failOuter {
				return errors.New("rollback outer")
			}
			return nil
		})
		if (err != nil) != failOuter {
			t.Fatalf("transaction error=%v rollback=%v", err, failOuter)
		}
		var count int
		if err = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM effects`).Scan(&count); err != nil {
			t.Fatal(err)
		}
		want := 2
		if failOuter {
			want = 0
		}
		if count != want {
			t.Fatalf("committed rows=%d want=%d", count, want)
		}
	}
}
