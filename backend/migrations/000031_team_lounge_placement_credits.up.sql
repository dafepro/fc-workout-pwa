-- Latched weekly placement budget earned from distinct team-local check-in days.
PRAGMA foreign_keys = ON;

CREATE TABLE team_lounge_v2_placement_credits (
  team_id TEXT NOT NULL REFERENCES teams(id),
  player_id TEXT NOT NULL REFERENCES players(id),
  week_key TEXT NOT NULL CHECK (length(week_key) = 10),
  day_key TEXT NOT NULL CHECK (length(day_key) = 10),
  source_kind TEXT NOT NULL CHECK (source_kind IN ('training_entry', 'planned_rest')),
  source_id TEXT NOT NULL CHECK (length(source_id) BETWEEN 1 AND 255),
  granted_at TEXT NOT NULL,
  PRIMARY KEY (team_id, player_id, week_key, day_key),
  UNIQUE (source_kind, source_id)
);

CREATE INDEX team_lounge_v2_placement_credits_player_week_idx
  ON team_lounge_v2_placement_credits (player_id, week_key, team_id);
