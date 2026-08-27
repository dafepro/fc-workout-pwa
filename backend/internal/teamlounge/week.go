package teamlounge

import (
	"errors"
	"time"
)

type Week struct {
	Key    string
	DayKey string
	Start  time.Time
	End    time.Time
}

func TeamWeek(now time.Time, location *time.Location) (Week, error) {
	if now.IsZero() || location == nil {
		return Week{}, errors.New("invalid team week")
	}
	localNow := now.In(location)
	start := localMidnight(localNow).AddDate(0, 0, -(int(localNow.Weekday())+6)%7)
	return Week{
		Key: start.Format(time.DateOnly), DayKey: localNow.Format(time.DateOnly),
		Start: start, End: start.AddDate(0, 0, 7),
	}, nil
}
