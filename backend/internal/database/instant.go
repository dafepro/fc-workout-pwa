package database

import (
	"database/sql/driver"
	"errors"
	"time"

	"modernc.org/sqlite"
)

func init() {
	// Fixed-width UTC text preserves nanoseconds; SQLite date functions round them away.
	sqlite.MustRegisterDeterministicScalarFunction("zoomigo_instant", 1,
		func(_ *sqlite.FunctionContext, values []driver.Value) (driver.Value, error) {
			if values[0] == nil {
				return nil, nil
			}
			stamp, ok := values[0].(string)
			if !ok {
				return nil, errors.New("invalid stored instant")
			}
			instant, err := time.Parse(time.RFC3339Nano, stamp)
			if err != nil || instant.UTC().Year() < 0 || instant.UTC().Year() > 9999 {
				return nil, errors.New("invalid stored instant")
			}
			return instant.UTC().Format("2006-01-02T15:04:05.000000000Z"), nil
		})
}

// InstantCandidates preserves indexed range scans while leaving room for restored RFC3339 offsets.
// These coarse bounds must always be followed by exact zoomigo_instant predicates.
func InstantCandidates(start, end time.Time) (string, string) {
	const format = "2006-01-02T15:04:05"
	return start.UTC().Add(-48 * time.Hour).Format(format), end.UTC().Add(48 * time.Hour).Format(format)
}
