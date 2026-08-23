package observability

import (
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

type Metadata struct {
	Service     string
	Environment string
	Release     string
}

func NewLogger(output io.Writer, metadata Metadata) *slog.Logger {
	handler := slog.NewJSONHandler(output, &slog.HandlerOptions{Level: slog.LevelInfo})
	return slog.New(handler).With(
		"service", metadata.Service,
		"environment", metadata.Environment,
		"release", metadata.Release,
	)
}

type responseRecorder struct {
	http.ResponseWriter
	status    int
	bytes     int
	errorCode string
}

func (recorder *responseRecorder) WriteHeader(status int) {
	if recorder.status != 0 {
		return
	}
	recorder.status = status
	recorder.ResponseWriter.WriteHeader(status)
}

func (recorder *responseRecorder) Write(body []byte) (int, error) {
	if recorder.status == 0 {
		recorder.WriteHeader(http.StatusOK)
	}
	written, err := recorder.ResponseWriter.Write(body)
	recorder.bytes += written
	return written, err
}

func (recorder *responseRecorder) Unwrap() http.ResponseWriter {
	return recorder.ResponseWriter
}

func (recorder *responseRecorder) SetErrorCode(code string) {
	recorder.errorCode = code
}

type errorCodeWriter interface {
	SetErrorCode(string)
}

func SetErrorCode(writer http.ResponseWriter, code string) {
	if recorder, ok := writer.(errorCodeWriter); ok {
		recorder.SetErrorCode(code)
	}
}

func HTTPMiddleware(logger *slog.Logger, metrics *Metrics) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			started := time.Now()
			recorder := &responseRecorder{ResponseWriter: w}
			if metrics != nil {
				metrics.HTTPInFlight.Inc()
				defer metrics.HTTPInFlight.Dec()
			}

			next.ServeHTTP(recorder, r)
			if recorder.status == 0 {
				recorder.status = http.StatusOK
			}
			route := routeTemplate(r)
			duration := time.Since(started).Seconds()
			if metrics != nil {
				metrics.observeHTTP(r.Method, route, recorder.status, recorder.errorCode, duration)
			}
			if logger == nil {
				return
			}

			attributes := []any{
				"request_id", recorder.Header().Get("X-Request-ID"),
				"method", boundedMethod(r.Method),
				"route", route,
				"status", recorder.status,
				"duration_seconds", duration,
				"response_bytes", recorder.bytes,
			}
			if recorder.errorCode != "" {
				attributes = append(attributes, "error_code", recorder.errorCode)
			}
			logger.Info("http_request_complete", attributes...)
		})
	}
}

func routeTemplate(request *http.Request) string {
	pattern := request.Pattern
	if space := strings.IndexByte(pattern, ' '); space >= 0 {
		pattern = pattern[space+1:]
	}
	if pattern == "" || (pattern == "/" && request.URL.Path != "/") {
		return "unmatched"
	}
	return pattern
}

func boundedMethod(method string) string {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete, http.MethodOptions:
		return method
	default:
		return "OTHER"
	}
}
