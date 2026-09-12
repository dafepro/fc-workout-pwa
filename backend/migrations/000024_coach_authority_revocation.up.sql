ALTER TABLE coach_team_assignments ADD COLUMN revoked_at TEXT;

-- The old application only closed these intervals when explicitly removing a coach.
UPDATE coach_team_assignments SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE active_to IS NOT NULL;
