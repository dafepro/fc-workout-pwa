package notifications_test

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/notifications"
	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

func TestResendUsesProviderIdempotencyAndClassifiesFailures(t *testing.T) {
	var key string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key = r.Header.Get("Idempotency-Key")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"id":"provider-one"}`))
	}))
	defer server.Close()
	mailer := notifications.Resend{APIKey: "test", Endpoint: server.URL, Client: server.Client()}
	id, err := mailer.Send(context.Background(), notifications.Message{
		To: "coach@example.test", From: "ZoomiGo <rewards@example.test>", Subject: "Reached",
		Text: "Aggregate progress only.", IdempotencyKey: "reward/achieved/outbox-one",
	})
	if err != nil || id != "provider-one" || key != "reward/achieved/outbox-one" {
		t.Fatalf("send id=%q key=%q err=%v", id, key, err)
	}
}

func TestSenderRecordsPermanentFailureWithoutChildDetail(t *testing.T) {
	var body string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		contents, _ := io.ReadAll(r.Body)
		body = string(contents)
		w.WriteHeader(http.StatusUnprocessableEntity)
	}))
	defer server.Close()
	outbox := &recordingOutbox{items: []store.TeamRewardNotification{{
		ID: "notice-one", RewardID: "reward-one", Kind: "close",
		RecipientEmail: "coach@example.test", TeamName: "Trailblazers", PrizeTitle: "Team picnic",
		GoalText: "One aggregate goal.", ProgressCurrent: 4, ProgressTarget: 5,
		DashboardPath: "/staff/teams/team-one/rewards", NotificationKey: "reward-one/close/notice-one",
	}}}
	sender := notifications.Sender{Outbox: outbox,
		Mailer: notifications.Resend{APIKey: "test", Endpoint: server.URL, Client: server.Client()},
		From:   "ZoomiGo <rewards@example.test>", BaseURL: "https://app.example.test",
		Now: func() time.Time { return time.Date(2026, 8, 25, 12, 0, 0, 0, time.UTC) },
	}
	if err := sender.Drain(context.Background()); err != nil {
		t.Fatal(err)
	}
	if outbox.failedCode != "provider_422" || !outbox.permanent {
		t.Fatalf("failure code=%q permanent=%v", outbox.failedCode, outbox.permanent)
	}
	if strings.Contains(body, "Mason") || !strings.Contains(body, "4 of 5") {
		t.Fatalf("email payload contains child detail or omits aggregate progress: %s", body)
	}
}

type recordingOutbox struct {
	items      []store.TeamRewardNotification
	failedCode string
	permanent  bool
}

func (outbox *recordingOutbox) ClaimTeamRewardNotifications(context.Context, time.Time, int) ([]store.TeamRewardNotification, error) {
	items := outbox.items
	outbox.items = nil
	return items, nil
}

func (*recordingOutbox) CompleteTeamRewardNotification(context.Context, string, string, time.Time) error {
	return nil
}

func (outbox *recordingOutbox) FailTeamRewardNotification(_ context.Context, _ string, code string, permanent bool, _ time.Time) error {
	outbox.failedCode, outbox.permanent = code, permanent
	return nil
}
