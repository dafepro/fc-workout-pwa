CREATE TABLE team_reward_media (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id),
  storage_key TEXT NOT NULL UNIQUE,
  sha256 TEXT NOT NULL,
  mime_type TEXT NOT NULL CHECK (mime_type = 'image/jpeg'),
  width INTEGER NOT NULL CHECK (width = 1200),
  height INTEGER NOT NULL CHECK (height = 800),
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 1048576),
  alt_kind TEXT NOT NULL CHECK (alt_kind IN ('prize_image', 'team_experience', 'food_or_treat')),
  created_by_account_id TEXT NOT NULL REFERENCES accounts(id),
  created_at TEXT NOT NULL,
  deleted_at TEXT
);

CREATE INDEX team_reward_media_team_created
  ON team_reward_media(team_id, created_at DESC);

ALTER TABLE team_rewards
  ADD COLUMN media_id TEXT REFERENCES team_reward_media(id);

CREATE INDEX team_rewards_media
  ON team_rewards(media_id)
  WHERE media_id IS NOT NULL;
