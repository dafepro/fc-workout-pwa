-- Management actions get their own table rather than more event_type values on
-- auth_audit_events. That table is CHECK-constrained, SQLite cannot alter a
-- CHECK, and every new console verb would otherwise mean rebuilding the
-- authentication audit trail. This is the change that stops that recurring.
PRAGMA foreign_keys = ON;

CREATE TABLE admin_audit_events (
  id TEXT PRIMARY KEY,
  actor_account_id TEXT NOT NULL REFERENCES accounts(id),
  -- Free text by shape but not by use: the handlers pass fixed constants, and
  -- a CHECK here would recreate exactly the migration problem this table exists
  -- to avoid.
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  -- Structured context only, and never a PIN, password, TOTP secret, recovery
  -- code, QR credential, or assessment value (REQ-702).
  detail_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL
);

CREATE INDEX admin_audit_events_occurred_idx
  ON admin_audit_events(occurred_at DESC);

CREATE INDEX admin_audit_events_target_idx
  ON admin_audit_events(target_type, target_id, occurred_at DESC);
