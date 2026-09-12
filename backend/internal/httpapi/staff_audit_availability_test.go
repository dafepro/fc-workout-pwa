package httpapi_test

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type slowAdministrativeBody struct {
	started, release chan struct{}
	reader           io.Reader
}

func (body *slowAdministrativeBody) Read(buffer []byte) (int, error) {
	if body.started != nil {
		close(body.started)
		body.started = nil
		<-body.release
	}
	return body.reader.Read(buffer)
}
func (*slowAdministrativeBody) Close() error { return nil }

func TestSlowAdministrativeBodyDoesNotHoldDatabaseConnection(t *testing.T) {
	db, handler := administrativeAuditHandler(t)
	started, release, finished := make(chan struct{}), make(chan struct{}), make(chan struct{})
	body := &slowAdministrativeBody{started: started, release: release, reader: strings.NewReader(`{"name":"Slow request"}`)}
	request := httptest.NewRequest(http.MethodPost, "/v1/staff/clubs", body)
	request.Header.Set("Authorization", "Bearer test")
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	go func() { defer close(finished); handler.ServeHTTP(response, request) }()
	defer func() { close(release); <-finished }()
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("request did not reach body")
	}
	ctx, cancel := context.WithTimeout(t.Context(), time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		t.Fatalf("incomplete request blocked unrelated database reads: %v", err)
	}
	if _, err := db.ExecContext(ctx, `UPDATE accounts SET status='disabled' WHERE id='account-coach'`); err != nil {
		t.Fatal(err)
	}
	// The handler must authorize again after buffering, not reuse stale preflight authority.
	t.Cleanup(func() {
		if response.Code != http.StatusUnauthorized {
			t.Errorf("revoked while reading body: status=%d", response.Code)
		}
	})
}

func TestAdministrativeBodyLimitIsEnforcedBeforeTransaction(t *testing.T) {
	db, handler := administrativeAuditHandler(t)
	response := administrativeRequest(t, handler, "POST", "/v1/staff/clubs", `{"name":"`+strings.Repeat("x", 16*1024)+`"}`)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("oversized body status=%d", response.Code)
	}
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM clubs`).Scan(&count); err != nil || count != 1 {
		t.Fatalf("oversized request changed clubs=%d err=%v", count, err)
	}
}
