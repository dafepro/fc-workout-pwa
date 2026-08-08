-- Reverses to the pre-staff shape, using the same build-beside-and-rename
-- approach as the up migration so no child foreign key is rewritten. Rows only
-- the newer schema can hold -- platform_admin accounts and staff audit events --
-- are dropped rather than coerced, because there is no honest older
-- representation of them.
PRAGMA defer_foreign_keys = ON;

DROP INDEX auth_audit_events_account_occurred_idx;

CREATE TABLE auth_audit_events_rebuilt (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id),
  credential_id TEXT REFERENCES auth_credentials(id),
  session_id TEXT REFERENCES auth_sessions(id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'credential_issued', 'credential_revoked', 'login_failed', 'login_locked',
    'login_succeeded', 'session_revoked'
  )),
  detail_code TEXT,
  occurred_at TEXT NOT NULL
);

INSERT INTO auth_audit_events_rebuilt (id, account_id, credential_id, session_id, event_type, detail_code, occurred_at)
SELECT id, account_id, credential_id, session_id, event_type, detail_code, occurred_at
FROM auth_audit_events
WHERE event_type IN (
  'credential_issued', 'credential_revoked', 'login_failed', 'login_locked',
  'login_succeeded', 'session_revoked'
);

DROP TABLE auth_audit_events;

ALTER TABLE auth_audit_events_rebuilt RENAME TO auth_audit_events;

CREATE INDEX auth_audit_events_account_occurred_idx
  ON auth_audit_events(account_id, occurred_at DESC);

DROP INDEX accounts_player_id_unique;

CREATE TABLE accounts_rebuilt (
  id TEXT PRIMARY KEY,
  club_id TEXT NOT NULL REFERENCES clubs(id),
  player_id TEXT REFERENCES players(id),
  role TEXT NOT NULL CHECK (role IN ('player', 'coach', 'club_admin')),
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  CHECK ((role = 'player' AND player_id IS NOT NULL) OR (role <> 'player' AND player_id IS NULL))
);

INSERT INTO accounts_rebuilt (id, club_id, player_id, role, status, created_at)
SELECT id, club_id, player_id, role, status, created_at FROM accounts WHERE role <> 'platform_admin';

DROP TABLE accounts;

ALTER TABLE accounts_rebuilt RENAME TO accounts;

CREATE UNIQUE INDEX accounts_player_id_unique ON accounts(player_id) WHERE player_id IS NOT NULL;
