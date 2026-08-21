-- Remove the Team Canvas durable schema.
PRAGMA foreign_keys = ON;

DROP INDEX IF EXISTS idx_team_canvas_rest_days_day;
DROP INDEX IF EXISTS idx_team_canvas_pieces_owner_day;
DROP INDEX IF EXISTS idx_team_canvas_pieces_week;
DROP TABLE IF EXISTS team_canvas_pieces;
DROP TABLE IF EXISTS team_canvas_avatar_positions;
DROP TABLE IF EXISTS team_canvas_settings;
DROP TABLE IF EXISTS team_canvas_rest_days;
