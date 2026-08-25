ALTER TABLE team_rewards ADD COLUMN hidden_at TEXT;
ALTER TABLE team_rewards ADD COLUMN close_notified_at TEXT;

CREATE TABLE team_reward_notification_outbox (
  id TEXT PRIMARY KEY,
  reward_id TEXT NOT NULL REFERENCES team_rewards(id),
  team_id TEXT NOT NULL REFERENCES teams(id),
  notification_kind TEXT NOT NULL CHECK (notification_kind IN ('close', 'achieved')),
  recipient_account_id TEXT NOT NULL REFERENCES accounts(id),
  recipient_email TEXT NOT NULL,
  team_name TEXT NOT NULL,
  prize_title TEXT NOT NULL,
  goal_text TEXT NOT NULL,
  progress_current INTEGER NOT NULL CHECK (progress_current >= 0),
  progress_target INTEGER NOT NULL CHECK (progress_target > 0),
  dashboard_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'permanent_failure')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  next_attempt_at TEXT NOT NULL,
  claimed_at TEXT,
  provider_message_id TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (reward_id, notification_kind, recipient_account_id)
);

CREATE INDEX team_reward_notification_due
  ON team_reward_notification_outbox(status, next_attempt_at, created_at);

CREATE TABLE team_reward_reports (
  id TEXT PRIMARY KEY,
  reward_id TEXT NOT NULL REFERENCES team_rewards(id),
  reporter_player_id TEXT NOT NULL REFERENCES players(id),
  reason TEXT NOT NULL CHECK (reason IN ('personal_information', 'inappropriate_content', 'wrong_team')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  resolution TEXT CHECK (resolution IN ('hide', 'cancel')),
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by_account_id TEXT REFERENCES accounts(id),
  UNIQUE (reward_id, reporter_player_id)
);

CREATE INDEX team_reward_reports_queue
  ON team_reward_reports(status, created_at, id);

CREATE TABLE team_reward_moderation_events (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES team_reward_reports(id),
  reward_id TEXT NOT NULL REFERENCES team_rewards(id),
  actor_account_id TEXT REFERENCES accounts(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('reported', 'hidden', 'cancelled')),
  occurred_at TEXT NOT NULL
);

CREATE INDEX team_reward_moderation_events_report_time
  ON team_reward_moderation_events(report_id, occurred_at);
