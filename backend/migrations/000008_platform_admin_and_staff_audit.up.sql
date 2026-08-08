-- Two table rebuilds in one migration, because SQLite cannot alter a CHECK and
-- both are prerequisites for staff identity. Doing them together means one
-- rehearsed destructive release rather than two.
--
-- accounts is a parent of auth_credentials, auth_sessions, auth_audit_events,
-- and coach_team_assignments. Renaming it out of the way would rewrite all four
-- child references to follow it, leaving them bound to the archive copy, so the
-- new table is built beside it under another name and renamed into place
-- instead: nothing ever references the temporary name, so nothing is rewritten.
--
-- Dropping the old parent is an implicit delete of every row a child still
-- points at. defer_foreign_keys holds that check until commit, by which time
-- the rows are back under the same table name. It is the transaction-scoped
-- pragma, unlike foreign_keys, which a migration's transaction cannot change.
PRAGMA defer_foreign_keys = ON;

DROP INDEX accounts_player_id_unique;

CREATE TABLE accounts_rebuilt (
  id TEXT PRIMARY KEY,
  club_id TEXT REFERENCES clubs(id),
  player_id TEXT REFERENCES players(id),
  role TEXT NOT NULL CHECK (role IN ('player', 'coach', 'club_admin', 'platform_admin')),
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  CHECK ((role = 'player' AND player_id IS NOT NULL) OR (role <> 'player' AND player_id IS NULL)),
  -- A global operator belongs to no single club, and nothing else may be
  -- clubless. Both halves matter: without the second, a coach row could lose
  -- the scope every authorization check reads.
  CHECK ((role = 'platform_admin' AND club_id IS NULL) OR (role <> 'platform_admin' AND club_id IS NOT NULL))
);

INSERT INTO accounts_rebuilt (id, club_id, player_id, role, status, created_at)
SELECT id, club_id, player_id, role, status, created_at FROM accounts;

DROP TABLE accounts;

ALTER TABLE accounts_rebuilt RENAME TO accounts;

CREATE UNIQUE INDEX accounts_player_id_unique ON accounts(player_id) WHERE player_id IS NOT NULL;

-- The event vocabulary gains the staff authentication events, and the
-- unknown-credential event that roadmap item 8 deferred for want of exactly
-- this rebuild (REQ-703).
DROP INDEX auth_audit_events_account_occurred_idx;

CREATE TABLE auth_audit_events_rebuilt (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id),
  credential_id TEXT REFERENCES auth_credentials(id),
  session_id TEXT REFERENCES auth_sessions(id),
  event_type TEXT NOT NULL CHECK (event_type IN (
    'credential_issued', 'credential_revoked', 'login_failed', 'login_locked',
    'login_succeeded', 'session_revoked', 'login_unknown_credential',
    'staff_login_failed', 'staff_login_locked', 'staff_login_succeeded',
    'staff_totp_failed', 'staff_recovery_code_used', 'staff_setup_completed',
    'staff_credential_reset', 'staff_step_up_failed', 'staff_step_up_succeeded',
    'staff_session_revoked'
  )),
  detail_code TEXT,
  occurred_at TEXT NOT NULL
);

INSERT INTO auth_audit_events_rebuilt (id, account_id, credential_id, session_id, event_type, detail_code, occurred_at)
SELECT id, account_id, credential_id, session_id, event_type, detail_code, occurred_at FROM auth_audit_events;

DROP TABLE auth_audit_events;

ALTER TABLE auth_audit_events_rebuilt RENAME TO auth_audit_events;

CREATE INDEX auth_audit_events_account_occurred_idx
  ON auth_audit_events(account_id, occurred_at DESC);
