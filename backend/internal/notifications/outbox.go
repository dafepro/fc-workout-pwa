package notifications

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/store"
)

type Outbox interface {
	ClaimTeamRewardNotifications(context.Context, time.Time, int) ([]store.TeamRewardNotification, error)
	CompleteTeamRewardNotification(context.Context, string, string, time.Time) error
	FailTeamRewardNotification(context.Context, string, string, bool, time.Time) error
}

type Sender struct {
	Outbox  Outbox
	Mailer  Mailer
	From    string
	BaseURL string
	Now     func() time.Time
}

func (sender Sender) Drain(ctx context.Context) error {
	now := time.Now
	if sender.Now != nil {
		now = sender.Now
	}
	items, err := sender.Outbox.ClaimTeamRewardNotifications(ctx, now().UTC(), 10)
	if err != nil {
		return err
	}
	for _, item := range items {
		message := rewardMessage(item, sender.From, sender.BaseURL)
		providerID, sendErr := sender.Mailer.Send(ctx, message)
		stamp := now().UTC()
		if sendErr == nil {
			if err = sender.Outbox.CompleteTeamRewardNotification(ctx, item.ID, providerID, stamp); err != nil {
				return err
			}
			continue
		}
		code, permanent := DeliveryFailure(sendErr)
		slog.Warn("reward email delivery failed", "notification_kind", item.Kind, "error_code", code, "permanent", permanent)
		if err = sender.Outbox.FailTeamRewardNotification(ctx, item.ID, code, permanent, stamp); err != nil {
			return err
		}
	}
	return nil
}

func rewardMessage(item store.TeamRewardNotification, from, baseURL string) Message {
	subject := "Team reward is close"
	opening := "Your team reward is close."
	if item.Kind == "achieved" {
		subject = "Team reward achieved"
		opening = "Your team reached its reward goal."
	}
	link := strings.TrimRight(baseURL, "/") + item.DashboardPath
	return Message{
		To: item.RecipientEmail, From: from, Subject: subject,
		Text: fmt.Sprintf("%s\n\nTeam: %s\nPrize: %s\nGoal: %s\nProgress: %d of %d\n\nReview: %s",
			opening, item.TeamName, item.PrizeTitle, item.GoalText, item.ProgressCurrent, item.ProgressTarget, link),
		IdempotencyKey: item.NotificationKey,
	}
}

func Run(ctx context.Context, sender Sender) {
	if err := sender.Drain(ctx); err != nil {
		slog.Warn("reward email outbox drain failed", "error", err)
	}
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := sender.Drain(ctx); err != nil {
				slog.Warn("reward email outbox drain failed", "error", err)
			}
		}
	}
}
