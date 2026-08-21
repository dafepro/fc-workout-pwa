//go:build !dev

package main

import (
	"database/sql"

	"github.com/dafepro/fc-workout-pwa/backend/internal/authn"
	"github.com/dafepro/fc-workout-pwa/backend/internal/config"
	"github.com/dafepro/fc-workout-pwa/backend/internal/httpapi"
	"github.com/dafepro/fc-workout-pwa/backend/internal/staffauth"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func configuredDevAccess(config.Config, *sql.DB, *store.Store, *authn.Service, *staffauth.Service) httpapi.DevAccessManager {
	return nil
}
