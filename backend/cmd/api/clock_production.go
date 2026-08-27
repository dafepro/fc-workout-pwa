//go:build !e2e

package main

import "github.com/dafepro/fc-workout-pwa/backend/internal/httpapi"

func appendBuildOptions(options []httpapi.Option) []httpapi.Option {
	return options
}
