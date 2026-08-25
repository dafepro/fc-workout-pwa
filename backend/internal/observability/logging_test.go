package observability

import (
	"bytes"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHTTPMiddlewareLogsOnlySafeRequestFields(t *testing.T) {
	var output bytes.Buffer
	logger := NewLogger(&output, Metadata{
		Service:     "api",
		Environment: "test",
		Release:     "0123456789abcdef",
	})
	handler := HTTPMiddleware(logger, nil)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		r.Pattern = "GET /v1/training-entries/{entryId}"
		w.Header().Set("X-Request-ID", "req_0123456789abcdef01234567")
		SetErrorCode(w, "not_found")
		http.Error(w, "private response", http.StatusNotFound)
	}))
	request := httptest.NewRequest(http.MethodGet, "https://api.example/v1/training-entries/player-secret?token=qr-secret", nil)
	request.Header.Set("Authorization", "Bearer bearer-secret")
	request.Header.Set("Cookie", "session=cookie-secret")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	var event map[string]any
	if err := json.Unmarshal(bytes.TrimSpace(output.Bytes()), &event); err != nil {
		t.Fatalf("decode log: %v\n%s", err, output.String())
	}
	want := map[string]any{
		"level":       "INFO",
		"msg":         "http_request_complete",
		"service":     "api",
		"environment": "test",
		"release":     "0123456789abcdef",
		"request_id":  "req_0123456789abcdef01234567",
		"method":      http.MethodGet,
		"route":       "/v1/training-entries/{entryId}",
		"status":      float64(http.StatusNotFound),
		"error_code":  "not_found",
	}
	for key, value := range want {
		if event[key] != value {
			t.Errorf("%s = %#v, want %#v", key, event[key], value)
		}
	}
	for _, forbidden := range []string{"url", "path", "query", "headers", "authorization", "cookie", "client", "ip"} {
		if _, ok := event[forbidden]; ok {
			t.Errorf("forbidden field %q was logged", forbidden)
		}
	}
	for _, secret := range []string{"player-secret", "qr-secret", "bearer-secret", "cookie-secret", "private response"} {
		if bytes.Contains(output.Bytes(), []byte(secret)) {
			t.Errorf("log contains secret %q: %s", secret, output.String())
		}
	}
	if _, ok := event["duration_seconds"].(float64); !ok {
		t.Errorf("duration_seconds = %#v, want a number", event["duration_seconds"])
	}
	if event["response_bytes"] != float64(len("private response\n")) {
		t.Errorf("response_bytes = %#v", event["response_bytes"])
	}
}

func TestHTTPMiddlewareUsesBoundedFallbackRoute(t *testing.T) {
	var output bytes.Buffer
	handler := HTTPMiddleware(slog.New(slog.NewJSONHandler(&output, nil)), nil)(http.NotFoundHandler())
	request := httptest.NewRequest(http.MethodGet, "/unregistered/player-secret", nil)

	handler.ServeHTTP(httptest.NewRecorder(), request)

	var event map[string]any
	if err := json.Unmarshal(bytes.TrimSpace(output.Bytes()), &event); err != nil {
		t.Fatal(err)
	}
	if event["route"] != "unmatched" {
		t.Fatalf("route = %#v, want unmatched", event["route"])
	}
	if bytes.Contains(output.Bytes(), []byte("player-secret")) {
		t.Fatalf("raw path leaked: %s", output.String())
	}
}
