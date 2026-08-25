package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/dafepro/fc-workout-pwa/backend/internal/domain"
)

type TeamRewardReportReason string
type TeamRewardReportResolution string

const (
	TeamRewardReportPersonalInformation  TeamRewardReportReason = "personal_information"
	TeamRewardReportInappropriateContent TeamRewardReportReason = "inappropriate_content"
	TeamRewardReportWrongTeam            TeamRewardReportReason = "wrong_team"

	TeamRewardResolutionHide   TeamRewardReportResolution = "hide"
	TeamRewardResolutionCancel TeamRewardReportResolution = "cancel"
)

var ErrTeamRewardReportExists = errors.New("team reward concern already reported")

type TeamRewardReport struct {
	ID               string                     `json:"id"`
	RewardID         string                     `json:"rewardId"`
	TeamID           string                     `json:"teamId"`
	TeamName         string                     `json:"teamName"`
	PrizeTitle       string                     `json:"prizeTitle"`
	Reason           TeamRewardReportReason     `json:"reason"`
	Status           string                     `json:"status"`
	Resolution       TeamRewardReportResolution `json:"resolution,omitempty"`
	CreatedAt        string                     `json:"createdAt"`
	ResolvedAt       string                     `json:"resolvedAt,omitempty"`
	ReporterPlayerID string                     `json:"-"`
}

type TeamRewardNotificationSummary struct {
	Kind           string `json:"kind"`
	Status         string `json:"status"`
	RecipientCount int    `json:"recipientCount"`
	SentCount      int    `json:"sentCount"`
	FailedCount    int    `json:"failedCount"`
}

type TeamRewardNotification struct {
	ID              string
	RewardID        string
	Kind            string
	RecipientEmail  string
	TeamName        string
	PrizeTitle      string
	GoalText        string
	ProgressCurrent int
	ProgressTarget  int
	DashboardPath   string
	Attempts        int
	NotificationKey string
}

func (store *Store) refreshTeamRewardState(ctx context.Context, teamID, rewardID string, now time.Time) error {
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin reward refresh: %w", err)
	}
	defer tx.Rollback()
	reward, err := scanTeamReward(tx.QueryRowContext(ctx, `SELECT r.id, r.team_id, r.created_by_account_id,
		r.status, r.prize_title, r.prize_description, r.starts_on, r.time_zone, r.rule_version, r.rule_kind,
		r.participation_scope, r.required_days, r.minimum_roster_percent, r.required_players,
		r.required_days_per_player, r.achieved_at, r.cancelled_at, r.hidden_at, r.close_notified_at, r.created_at, r.updated_at,
		COALESCE(r.media_id, ''), COALESCE(m.alt_kind, '')
		FROM team_rewards r LEFT JOIN team_reward_media m ON m.id = r.media_id AND m.deleted_at IS NULL
		WHERE r.id = ? AND r.team_id = ?`, rewardID, teamID))
	if errors.Is(err, sql.ErrNoRows) {
		return ErrTeamRewardUnavailable
	}
	if err != nil {
		return fmt.Errorf("load reward for refresh: %w", err)
	}
	if reward.Status != TeamRewardActive {
		return tx.Commit()
	}
	progress, err := store.evaluateTeamReward(ctx, tx, reward, now)
	if err != nil {
		return err
	}
	stamp := now.UTC().Format(time.RFC3339Nano)
	kind := ""
	if progress.Achieved {
		result, updateErr := tx.ExecContext(ctx, `UPDATE team_rewards SET status = 'achieved', achieved_at = ?, updated_at = ?
			WHERE id = ? AND status = 'active'`, stamp, stamp, reward.ID)
		if updateErr != nil {
			return fmt.Errorf("latch reward achievement: %w", updateErr)
		}
		if changed, _ := result.RowsAffected(); changed == 1 {
			if err = insertRewardEvent(ctx, tx, reward.ID, "", "achieved", stamp); err != nil {
				return err
			}
			kind = "achieved"
		}
	} else if progress.Close && reward.CloseNotifiedAt == "" {
		kind = "close"
	}
	if kind != "" {
		if err = queueTeamRewardNotifications(ctx, tx, reward, progress, kind, now); err != nil {
			return err
		}
		if kind == "close" {
			if _, err = tx.ExecContext(ctx, `UPDATE team_rewards SET close_notified_at = ?
				WHERE id = ? AND close_notified_at IS NULL`, stamp, reward.ID); err != nil {
				return fmt.Errorf("mark close notice queued: %w", err)
			}
		}
	}
	if err = tx.Commit(); err != nil {
		return fmt.Errorf("commit reward refresh: %w", err)
	}
	return nil
}

func (store *Store) RefreshActiveTeamRewards(ctx context.Context, now time.Time) error {
	rows, err := store.db.QueryContext(ctx, `SELECT team_id, id FROM team_rewards
		WHERE status = 'active' ORDER BY updated_at, id`)
	if err != nil {
		return fmt.Errorf("list active rewards for refresh: %w", err)
	}
	var rewards [][2]string
	for rows.Next() {
		var reward [2]string
		if err = rows.Scan(&reward[0], &reward[1]); err != nil {
			rows.Close()
			return fmt.Errorf("scan active reward for refresh: %w", err)
		}
		rewards = append(rewards, reward)
	}
	if err = rows.Close(); err != nil {
		return fmt.Errorf("close active reward refresh list: %w", err)
	}
	for _, reward := range rewards {
		if err = store.refreshTeamRewardState(ctx, reward[0], reward[1], now); err != nil {
			return err
		}
	}
	return nil
}

func queueTeamRewardNotifications(ctx context.Context, tx *sql.Tx, reward TeamReward, progress domain.TeamRewardProgress, kind string, now time.Time) error {
	location, err := time.LoadLocation(reward.TimeZone)
	if err != nil {
		return fmt.Errorf("load notification team time zone: %w", err)
	}
	teamDay := now.In(location).Format("2006-01-02")
	rows, err := tx.QueryContext(ctx, `SELECT a.id, c.email_identity, t.name FROM coach_team_assignments x
		JOIN accounts a ON a.id = x.account_id AND a.role = 'coach' AND a.status = 'active'
		JOIN auth_password_credentials c ON c.account_id = a.id AND c.revoked_at IS NULL
		JOIN teams t ON t.id = x.team_id WHERE x.team_id = ? AND x.active_from <= ?
		AND (x.active_to IS NULL OR x.active_to >= ?) ORDER BY a.id`, reward.TeamID, teamDay, teamDay)
	if err != nil {
		return fmt.Errorf("load reward notification recipients: %w", err)
	}
	defer rows.Close()
	stamp := now.UTC().Format(time.RFC3339Nano)
	for rows.Next() {
		var accountID, email, teamName string
		if err = rows.Scan(&accountID, &email, &teamName); err != nil {
			return fmt.Errorf("scan reward notification recipient: %w", err)
		}
		if _, err = tx.ExecContext(ctx, `INSERT OR IGNORE INTO team_reward_notification_outbox (
			id, reward_id, team_id, notification_kind, recipient_account_id, recipient_email,
			team_name, prize_title, goal_text, progress_current, progress_target, dashboard_path,
			next_attempt_at, created_at, updated_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			newID("reward_notice"), reward.ID, reward.TeamID, kind, accountID, email, teamName,
			reward.PrizeTitle, rewardGoalText(reward.Rule), progress.Current, progress.Target,
			"/staff/teams/"+reward.TeamID+"/rewards", stamp, stamp, stamp); err != nil {
			return fmt.Errorf("queue reward notification: %w", err)
		}
	}
	return rows.Err()
}

func rewardGoalText(rule domain.TeamRewardRule) string {
	scope := "an approved fitness check-in"
	if rule.ParticipationScope == domain.RewardParticipationRecommended {
		scope = "the planned workout"
	}
	if rule.Kind == domain.RewardRuleQualifyingTeamDays {
		return fmt.Sprintf("At least %d%% of active players record %s on %d days.", rule.MinimumRosterPercent, scope, rule.RequiredDays)
	}
	return fmt.Sprintf("%d players record %s on %d days.", rule.RequiredPlayers, scope, rule.RequiredDaysPerPlayer)
}

func (reason TeamRewardReportReason) Valid() bool {
	return reason == TeamRewardReportPersonalInformation || reason == TeamRewardReportInappropriateContent || reason == TeamRewardReportWrongTeam
}

func (resolution TeamRewardReportResolution) Valid() bool {
	return resolution == TeamRewardResolutionHide || resolution == TeamRewardResolutionCancel
}

func (store *Store) ReportTeamReward(ctx context.Context, actor domain.Actor, teamID, rewardID string, reason TeamRewardReportReason, now time.Time) (TeamRewardReport, error) {
	if actor.Role != domain.RolePlayer || actor.PlayerID == "" || !reason.Valid() {
		return TeamRewardReport{}, ErrTeamRewardInvalid
	}
	var member int
	var teamName, prizeTitle string
	today := now.In(store.location).Format("2006-01-02")
	if err := store.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM team_memberships
		WHERE team_id = ? AND player_id = ? AND active_from <= ? AND (active_to IS NULL OR active_to >= ?)`,
		teamID, actor.PlayerID, today, today).Scan(&member); err != nil || member != 1 {
		return TeamRewardReport{}, ErrTeamRewardUnavailable
	}
	if err := store.db.QueryRowContext(ctx, `SELECT t.name, r.prize_title FROM team_rewards r
		JOIN teams t ON t.id = r.team_id WHERE r.id = ? AND r.team_id = ?
		AND r.status IN ('active', 'achieved') AND r.hidden_at IS NULL`, rewardID, teamID).Scan(&teamName, &prizeTitle); errors.Is(err, sql.ErrNoRows) {
		return TeamRewardReport{}, ErrTeamRewardUnavailable
	} else if err != nil {
		return TeamRewardReport{}, fmt.Errorf("load reportable reward: %w", err)
	}
	report := TeamRewardReport{ID: newID("reward_report"), RewardID: rewardID, TeamID: teamID,
		TeamName: teamName, PrizeTitle: prizeTitle, Reason: reason, Status: "open",
		CreatedAt: now.UTC().Format(time.RFC3339Nano), ReporterPlayerID: actor.PlayerID}
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return TeamRewardReport{}, fmt.Errorf("begin reward report: %w", err)
	}
	defer tx.Rollback()
	if _, err = tx.ExecContext(ctx, `INSERT INTO team_reward_reports
		(id, reward_id, reporter_player_id, reason, created_at) VALUES (?, ?, ?, ?, ?)`,
		report.ID, report.RewardID, report.ReporterPlayerID, report.Reason, report.CreatedAt); err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return TeamRewardReport{}, ErrTeamRewardReportExists
		}
		return TeamRewardReport{}, fmt.Errorf("insert reward report: %w", err)
	}
	if err = insertModerationEvent(ctx, tx, report.ID, report.RewardID, "", "reported", report.CreatedAt); err != nil {
		return TeamRewardReport{}, err
	}
	if err = tx.Commit(); err != nil {
		return TeamRewardReport{}, fmt.Errorf("commit reward report: %w", err)
	}
	return report, nil
}

func (store *Store) ListTeamRewardReports(ctx context.Context) ([]TeamRewardReport, error) {
	rows, err := store.db.QueryContext(ctx, `SELECT q.id, q.reward_id, r.team_id, t.name, r.prize_title,
		q.reason, q.status, COALESCE(q.resolution, ''), q.created_at, COALESCE(q.resolved_at, '')
		FROM team_reward_reports q JOIN team_rewards r ON r.id = q.reward_id JOIN teams t ON t.id = r.team_id
		ORDER BY CASE q.status WHEN 'open' THEN 0 ELSE 1 END, q.created_at, q.id`)
	if err != nil {
		return nil, fmt.Errorf("list reward reports: %w", err)
	}
	defer rows.Close()
	var reports []TeamRewardReport
	for rows.Next() {
		var report TeamRewardReport
		if err = rows.Scan(&report.ID, &report.RewardID, &report.TeamID, &report.TeamName, &report.PrizeTitle,
			&report.Reason, &report.Status, &report.Resolution, &report.CreatedAt, &report.ResolvedAt); err != nil {
			return nil, fmt.Errorf("scan reward report: %w", err)
		}
		reports = append(reports, report)
	}
	return reports, rows.Err()
}

func (store *Store) ResolveTeamRewardReport(ctx context.Context, reportID, actorAccountID string, resolution TeamRewardReportResolution, now time.Time) (TeamRewardReport, error) {
	if strings.TrimSpace(actorAccountID) == "" || !resolution.Valid() {
		return TeamRewardReport{}, ErrTeamRewardInvalid
	}
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return TeamRewardReport{}, fmt.Errorf("begin reward report resolution: %w", err)
	}
	defer tx.Rollback()
	var report TeamRewardReport
	if err = tx.QueryRowContext(ctx, `SELECT q.id, q.reward_id, r.team_id, t.name, r.prize_title,
		q.reason, q.status, q.created_at FROM team_reward_reports q
		JOIN team_rewards r ON r.id = q.reward_id JOIN teams t ON t.id = r.team_id
		WHERE q.id = ? AND q.status = 'open'`, reportID).Scan(&report.ID, &report.RewardID, &report.TeamID,
		&report.TeamName, &report.PrizeTitle, &report.Reason, &report.Status, &report.CreatedAt); errors.Is(err, sql.ErrNoRows) {
		return TeamRewardReport{}, ErrTeamRewardState
	} else if err != nil {
		return TeamRewardReport{}, fmt.Errorf("load open reward report: %w", err)
	}
	stamp := now.UTC().Format(time.RFC3339Nano)
	eventType := "hidden"
	if resolution == TeamRewardResolutionHide {
		_, err = tx.ExecContext(ctx, `UPDATE team_rewards SET hidden_at = ?, updated_at = ? WHERE id = ?`, stamp, stamp, report.RewardID)
	} else {
		eventType = "cancelled"
		_, err = tx.ExecContext(ctx, `UPDATE team_rewards SET status = 'cancelled', cancelled_at = ?, updated_at = ?
			WHERE id = ? AND status IN ('active', 'achieved')`, stamp, stamp, report.RewardID)
	}
	if err != nil {
		return TeamRewardReport{}, fmt.Errorf("resolve reported reward: %w", err)
	}
	if _, err = tx.ExecContext(ctx, `UPDATE team_reward_reports SET status = 'resolved', resolution = ?,
		resolved_at = ?, resolved_by_account_id = ? WHERE id = ? AND status = 'open'`,
		resolution, stamp, actorAccountID, report.ID); err != nil {
		return TeamRewardReport{}, fmt.Errorf("resolve reward report: %w", err)
	}
	if err = insertModerationEvent(ctx, tx, report.ID, report.RewardID, actorAccountID, eventType, stamp); err != nil {
		return TeamRewardReport{}, err
	}
	if err = tx.Commit(); err != nil {
		return TeamRewardReport{}, fmt.Errorf("commit reward report resolution: %w", err)
	}
	report.Status, report.Resolution, report.ResolvedAt = "resolved", resolution, stamp
	return report, nil
}

func insertModerationEvent(ctx context.Context, tx *sql.Tx, reportID, rewardID, actorAccountID, eventType, stamp string) error {
	var actor any
	if actorAccountID != "" {
		actor = actorAccountID
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO team_reward_moderation_events
		(id, report_id, reward_id, actor_account_id, event_type, occurred_at) VALUES (?, ?, ?, ?, ?, ?)`,
		newID("reward_moderation"), reportID, rewardID, actor, eventType, stamp); err != nil {
		return fmt.Errorf("insert reward moderation event: %w", err)
	}
	return nil
}

func (store *Store) ClaimTeamRewardNotifications(ctx context.Context, now time.Time, limit int) ([]TeamRewardNotification, error) {
	if limit < 1 || limit > 25 {
		limit = 10
	}
	tx, err := store.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin notification claim: %w", err)
	}
	defer tx.Rollback()
	stamp := now.UTC().Format(time.RFC3339Nano)
	stale := now.Add(-5 * time.Minute).UTC().Format(time.RFC3339Nano)
	rows, err := tx.QueryContext(ctx, `SELECT id, reward_id, notification_kind, recipient_email,
		team_name, prize_title, goal_text, progress_current, progress_target, dashboard_path, attempts
		FROM team_reward_notification_outbox WHERE
		(status = 'pending' AND next_attempt_at <= ?) OR (status = 'sending' AND claimed_at <= ?)
		ORDER BY created_at, id LIMIT ?`, stamp, stale, limit)
	if err != nil {
		return nil, fmt.Errorf("list due reward notifications: %w", err)
	}
	var items []TeamRewardNotification
	for rows.Next() {
		var item TeamRewardNotification
		if err = rows.Scan(&item.ID, &item.RewardID, &item.Kind, &item.RecipientEmail, &item.TeamName,
			&item.PrizeTitle, &item.GoalText, &item.ProgressCurrent, &item.ProgressTarget,
			&item.DashboardPath, &item.Attempts); err != nil {
			rows.Close()
			return nil, fmt.Errorf("scan due reward notification: %w", err)
		}
		item.NotificationKey = item.RewardID + "/" + item.Kind + "/" + item.ID
		items = append(items, item)
	}
	if err = rows.Close(); err != nil {
		return nil, fmt.Errorf("close due reward notifications: %w", err)
	}
	for _, item := range items {
		if _, err = tx.ExecContext(ctx, `UPDATE team_reward_notification_outbox
			SET status = 'sending', claimed_at = ?, updated_at = ? WHERE id = ?`, stamp, stamp, item.ID); err != nil {
			return nil, fmt.Errorf("claim reward notification: %w", err)
		}
	}
	if err = tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit notification claim: %w", err)
	}
	return items, nil
}

func (store *Store) CompleteTeamRewardNotification(ctx context.Context, id, providerMessageID string, now time.Time) error {
	_, err := store.db.ExecContext(ctx, `UPDATE team_reward_notification_outbox SET status = 'sent',
		provider_message_id = ?, last_error_code = NULL, claimed_at = NULL, updated_at = ?
		WHERE id = ? AND status = 'sending'`, providerMessageID, now.UTC().Format(time.RFC3339Nano), id)
	return err
}

func (store *Store) FailTeamRewardNotification(ctx context.Context, id, errorCode string, permanent bool, now time.Time) error {
	status := "pending"
	if permanent {
		status = "permanent_failure"
	}
	var attempts int
	if err := store.db.QueryRowContext(ctx, `SELECT attempts + 1 FROM team_reward_notification_outbox WHERE id = ?`, id).Scan(&attempts); err != nil {
		return err
	}
	if attempts >= 5 {
		status = "permanent_failure"
	}
	delay := time.Minute * time.Duration(1<<(min(attempts, 5)-1))
	_, err := store.db.ExecContext(ctx, `UPDATE team_reward_notification_outbox SET status = ?, attempts = ?,
		next_attempt_at = ?, claimed_at = NULL, last_error_code = ?, updated_at = ? WHERE id = ? AND status = 'sending'`,
		status, attempts, now.Add(delay).UTC().Format(time.RFC3339Nano), errorCode, now.UTC().Format(time.RFC3339Nano), id)
	return err
}

func (store *Store) notificationSummary(ctx context.Context, rewardID string) ([]TeamRewardNotificationSummary, error) {
	rows, err := store.db.QueryContext(ctx, `SELECT notification_kind, COUNT(*),
		SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END),
		SUM(CASE WHEN status = 'permanent_failure' THEN 1 ELSE 0 END)
		FROM team_reward_notification_outbox WHERE reward_id = ? GROUP BY notification_kind ORDER BY notification_kind`, rewardID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var summaries []TeamRewardNotificationSummary
	for rows.Next() {
		var item TeamRewardNotificationSummary
		if err = rows.Scan(&item.Kind, &item.RecipientCount, &item.SentCount, &item.FailedCount); err != nil {
			return nil, err
		}
		switch {
		case item.FailedCount > 0:
			item.Status = "failed"
		case item.SentCount == item.RecipientCount:
			item.Status = "sent"
		default:
			item.Status = "pending"
		}
		summaries = append(summaries, item)
	}
	return summaries, rows.Err()
}
