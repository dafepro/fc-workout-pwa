//go:build e2e

package main

import (
	"sync"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/httpapi"
)

type e2eClock struct {
	mu       sync.RWMutex
	override *time.Time
}

func (clock *e2eClock) Now() time.Time {
	clock.mu.RLock()
	defer clock.mu.RUnlock()
	if clock.override != nil {
		return *clock.override
	}
	return time.Now()
}

func (clock *e2eClock) Set(now time.Time) {
	clock.mu.Lock()
	defer clock.mu.Unlock()
	now = now.UTC()
	clock.override = &now
}

func (clock *e2eClock) Reset() {
	clock.mu.Lock()
	defer clock.mu.Unlock()
	clock.override = nil
}

func appendBuildOptions(options []httpapi.Option) []httpapi.Option {
	clock := &e2eClock{}
	return append(options, httpapi.WithE2EClock(clock.Now, clock.Set, clock.Reset))
}
