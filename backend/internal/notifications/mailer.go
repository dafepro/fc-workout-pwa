package notifications

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
)

type Message struct {
	To             string
	From           string
	Subject        string
	Text           string
	IdempotencyKey string
}

type Mailer interface {
	Send(context.Context, Message) (string, error)
}

type DeliveryError struct {
	Code      string
	Permanent bool
}

func (err DeliveryError) Error() string { return err.Code }

type Sink struct{}

func (Sink) Send(_ context.Context, message Message) (string, error) {
	slog.Info("reward email captured by local sink", "notification_key", message.IdempotencyKey)
	return "sink:" + message.IdempotencyKey, nil
}

type Resend struct {
	APIKey   string
	Endpoint string
	Client   *http.Client
}

func (mailer Resend) Send(ctx context.Context, message Message) (string, error) {
	endpoint := strings.TrimRight(mailer.Endpoint, "/")
	if endpoint == "" {
		endpoint = "https://api.resend.com"
	}
	client := mailer.Client
	if client == nil {
		client = &http.Client{Timeout: 10 * time.Second}
	}
	body, err := json.Marshal(map[string]any{
		"from": message.From, "to": []string{message.To}, "subject": message.Subject, "text": message.Text,
	})
	if err != nil {
		return "", DeliveryError{Code: "encode_failed", Permanent: true}
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint+"/emails", bytes.NewReader(body))
	if err != nil {
		return "", DeliveryError{Code: "request_failed", Permanent: true}
	}
	request.Header.Set("Authorization", "Bearer "+mailer.APIKey)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotency-Key", message.IdempotencyKey)
	response, err := client.Do(request)
	if err != nil {
		return "", DeliveryError{Code: "network_error"}
	}
	defer response.Body.Close()
	responseBody, readErr := io.ReadAll(io.LimitReader(response.Body, 64<<10))
	if readErr != nil {
		return "", DeliveryError{Code: "provider_read_failed"}
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return "", DeliveryError{Code: fmt.Sprintf("provider_%d", response.StatusCode), Permanent: response.StatusCode < 500 && response.StatusCode != http.StatusTooManyRequests}
	}
	var result struct {
		ID string `json:"id"`
	}
	if err = json.Unmarshal(responseBody, &result); err != nil || result.ID == "" {
		return "", DeliveryError{Code: "invalid_provider_response"}
	}
	return result.ID, nil
}

func DeliveryFailure(err error) (string, bool) {
	var delivery DeliveryError
	if errors.As(err, &delivery) {
		return delivery.Code, delivery.Permanent
	}
	return "unknown_error", false
}
