CREATE TABLE auth_credentials (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  selector_hash BLOB NOT NULL UNIQUE,
  verifier_salt BLOB NOT NULL,
  verifier_hash BLOB NOT NULL,
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 10),
  locked_until TEXT,
  issued_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE INDEX auth_credentials_account_active_idx
  ON auth_credentials(account_id, issued_at DESC)
  WHERE revoked_at IS NULL;

CREATE TABLE auth_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  credential_id TEXT NOT NULL REFERENCES auth_credentials(id),
  token_hash BLOB NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX auth_sessions_account_active_idx
  ON auth_sessions(account_id, expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE auth_audit_events (
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

CREATE INDEX auth_audit_events_account_occurred_idx
  ON auth_audit_events(account_id, occurred_at DESC);
