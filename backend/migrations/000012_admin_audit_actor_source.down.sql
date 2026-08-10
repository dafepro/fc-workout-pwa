-- Reverting restores the NOT NULL actor, which no CLI-written row can satisfy.
-- Those rows are dropped rather than given a borrowed actor: an audit trail that
-- names the wrong account is worse than one that is visibly shorter, and the
-- count is recoverable from the events the CLI's own subjects still carry.
PRAGMA foreign_keys = ON;

CREATE TABLE admin_audit_events_reverted (
  id TEXT PRIMARY KEY,
  actor_account_id TEXT NOT NULL REFERENCES accounts(id),
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL
);

INSERT INTO admin_audit_events_reverted
  (id, actor_account_id, action, target_type, target_id, detail_json, occurred_at)
SELECT id, actor_account_id, action, target_type, target_id, detail_json, occurred_at
FROM admin_audit_events
WHERE actor_account_id IS NOT NULL;

DROP TABLE admin_audit_events;

ALTER TABLE admin_audit_events_reverted RENAME TO admin_audit_events;

CREATE INDEX admin_audit_events_occurred_idx
  ON admin_audit_events(occurred_at DESC);

CREATE INDEX admin_audit_events_target_idx
  ON admin_audit_events(target_type, target_id, occurred_at DESC);
