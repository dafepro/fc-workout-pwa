DROP INDEX IF EXISTS team_reward_moderation_events_report_time;
DROP TABLE IF EXISTS team_reward_moderation_events;
DROP INDEX IF EXISTS team_reward_reports_queue;
DROP TABLE IF EXISTS team_reward_reports;
DROP INDEX IF EXISTS team_reward_notification_due;
DROP TABLE IF EXISTS team_reward_notification_outbox;
ALTER TABLE team_rewards DROP COLUMN hidden_at;
ALTER TABLE team_rewards DROP COLUMN close_notified_at;
