-- zoomigo:table-rebuild
--
-- Two table rebuilds in one migration, because SQLite cannot alter a CHECK and
-- both are prerequisites for staff identity.
--
-- The directive on the first line matters. accounts is the parent of
-- auth_credentials, auth_sessions, auth_audit_events, and
-- coach_team_assignments, and dropping a parent while foreign keys are enforced
-- counts as deleting every row a child still references. Deferring the check
-- does not save it: the drop increments SQLite's violation counter and renaming
-- a replacement into place never decrements it, so the commit fails on any
-- database that has rows -- which is every database except a fresh one. The
-- runner therefore disables enforcement around this file and runs
-- PRAGMA foreign_key_check itself before committing.
--
-- The replacement is still built beside the original and renamed into place, so
-- no child's foreign key is rewritten to follow the original out of the way.

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
