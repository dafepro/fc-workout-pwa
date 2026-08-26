-- One idempotent visit per player and immutable weekly lounge room.
PRAGMA foreign_keys = ON;

CREATE TABLE team_lounge_v2_weekly_visits (
  room_id TEXT NOT NULL REFERENCES team_lounge_v2_room_bindings(room_id) ON DELETE CASCADE,
  player_id TEXT NOT NULL REFERENCES players(id),
  last_visited_at TEXT NOT NULL,
  PRIMARY KEY (room_id, player_id)
);

CREATE INDEX team_lounge_v2_weekly_visits_recent_idx
  ON team_lounge_v2_weekly_visits (room_id, last_visited_at DESC, player_id);
