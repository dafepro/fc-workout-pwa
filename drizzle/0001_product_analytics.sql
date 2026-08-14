CREATE TABLE analytics_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version = 1),
  source TEXT NOT NULL CHECK (source IN ('client', 'server')),
  event_name TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  occurred_at INTEGER NOT NULL,
  subject_key TEXT,
  team_key TEXT,
  visit_id TEXT,
  route_name TEXT,
  active_ms INTEGER,
  local_day TEXT,
  local_hour INTEGER CHECK (local_hour IS NULL OR local_hour BETWEEN 0 AND 23),
  properties_json TEXT NOT NULL CHECK (json_valid(properties_json)),
  sample_weight INTEGER NOT NULL DEFAULT 1 CHECK (sample_weight >= 1)
);

CREATE INDEX idx_analytics_events_received
  ON analytics_events(received_at);

CREATE INDEX idx_analytics_events_subject_received
  ON analytics_events(subject_key, received_at)
  WHERE subject_key IS NOT NULL;

CREATE INDEX idx_analytics_events_name_received
  ON analytics_events(event_name, received_at);

PRAGMA optimize;
