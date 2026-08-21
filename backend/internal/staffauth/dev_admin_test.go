//go:build dev

package staffauth

import (
	"testing"
	"time"
)

func TestDevAdminUsesPasswordOnlyAndMintsAPlatformAdminSession(t *testing.T) {
	now := time.Date(2026, 8, 21, 12, 0, 0, 0, time.UTC)
	service, _ := newService(t, &now)

	if err := service.ResetDevAdmin(t.Context(), "admin@dev.zoomigo.invalid", "well-known-preview-pass"); err != nil {
		t.Fatalf("ResetDevAdmin() error = %v", err)
	}
	session, err := service.CreateDevSession(t.Context(), "admin@dev.zoomigo.invalid", "well-known-preview-pass")
	if err != nil {
		t.Fatalf("CreateDevSession() error = %v", err)
	}
	if session.Role != "platform_admin" || session.Token == "" {
		t.Fatalf("session = %+v", session)
	}
	if _, err = service.CreateDevSession(t.Context(), "admin@dev.zoomigo.invalid", "wrong"); err == nil {
		t.Fatal("CreateDevSession() accepted the wrong password")
	}
}
