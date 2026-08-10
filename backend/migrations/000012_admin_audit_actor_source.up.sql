-- Ending an account from the CLI left no trace. `actor_account_id` was NOT NULL
-- and a CLI invocation has no account behind it, so the break-glass path (F-O11)
-- could do everything the console could and record none of it -- and ending an
-- account is exactly the action that should leave a trace.
--
-- The actor becomes optional and gains a source saying why it is absent. A
-- rebuild is the only way to drop a NOT NULL in SQLite, and this one is safe
-- without the table-rebuild directive: nothing references admin_audit_events, so
-- dropping it deletes no row any child still points at.
--
-- actor_source carries no CHECK, for the reason `action` carries none: this
-- table exists so that a new value never means rebuilding an audit trail. The
-- pairing is the invariant instead -- 'console' rows name an account, other
-- sources do not -- and it is enforced by the one writer, store.StaffStore.
PRAGMA foreign_keys = ON;

CREATE TABLE admin_audit_events_rebuilt (
  id TEXT PRIMARY KEY,
  -- NULL when the action came from somewhere with no signed-in account.
  actor_account_id TEXT REFERENCES accounts(id),
  actor_source TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  -- Structured context only, and never a PIN, password, TOTP secret, recovery
  -- code, QR credential, or assessment value (REQ-702).
  detail_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL
);

-- Every existing row was written by a console handler holding a session, so
-- 'console' is a statement of fact rather than a default.
INSERT INTO admin_audit_events_rebuilt
  (id, actor_account_id, actor_source, action, target_type, target_id, detail_json, occurred_at)
SELECT id, actor_account_id, 'console', action, target_type, target_id, detail_json, occurred_at
FROM admin_audit_events;

DROP TABLE admin_audit_events;

ALTER TABLE admin_audit_events_rebuilt RENAME TO admin_audit_events;

CREATE INDEX admin_audit_events_occurred_idx
  ON admin_audit_events(occurred_at DESC);

CREATE INDEX admin_audit_events_target_idx
  ON admin_audit_events(target_type, target_id, occurred_at DESC);
