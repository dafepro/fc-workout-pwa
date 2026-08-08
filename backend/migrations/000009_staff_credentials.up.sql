-- Staff credentials live apart from auth_credentials on purpose. That table's
-- invariants are tuned to one shape -- a 256-bit selector plus four PIN digits,
-- with a failure ladder built around them -- and widening it to carry an email
-- identity, a password, and a second factor is how a security-critical table
-- stops being reviewable in one sitting.
PRAGMA foreign_keys = ON;

CREATE TABLE auth_password_credentials (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id),
  -- Lower-cased and trimmed before storage, so one person cannot hold two
  -- identities that differ only in case.
  email_identity TEXT NOT NULL UNIQUE,
  verifier_salt BLOB NOT NULL,
  verifier_hash BLOB NOT NULL,
  -- Set while a temporary password is outstanding; cleared when the account
  -- chooses its own. Nothing but the setup flow is reachable until then.
  must_change INTEGER NOT NULL DEFAULT 0 CHECK (must_change IN (0, 1)),
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 10),
  locked_until TEXT,
  issued_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT
);

CREATE TABLE auth_totp_enrollments (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL UNIQUE REFERENCES accounts(id),
  -- Encrypted rather than hashed, because verifying a time-based code needs the
  -- secret back. The key lives in the process environment, not the database, so
  -- a stolen backup is not a stolen second factor.
  secret_ciphertext BLOB NOT NULL,
  secret_nonce BLOB NOT NULL,
  confirmed_at TEXT,
  -- The last accepted time step. A code is single-use because a step at or
  -- below this one is refused, which is what stops a shoulder-surfed or
  -- replayed code inside its own 30-second window.
  last_used_step INTEGER,
  issued_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE auth_recovery_codes (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  code_hash BLOB NOT NULL UNIQUE,
  issued_at TEXT NOT NULL,
  used_at TEXT
);

CREATE INDEX auth_recovery_codes_account_unused_idx
  ON auth_recovery_codes(account_id)
  WHERE used_at IS NULL;

CREATE TABLE staff_setup_tokens (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  token_hash BLOB NOT NULL UNIQUE,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);

-- Separate from auth_sessions, whose credential_id is NOT NULL and points at a
-- QR credential no staff account has. Keeping them apart also means a staff
-- session can carry the two clocks REQ-205 wants and the last-authenticated
-- stamp that step-up reads, without adding three nullable columns to the
-- player session table.
CREATE TABLE staff_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  token_hash BLOB NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  -- Absolute lifetime; never extended, whatever the session does.
  expires_at TEXT NOT NULL,
  -- Idle deadline; rolls forward on use, but never past expires_at.
  idle_expires_at TEXT NOT NULL,
  -- When this account last proved password and TOTP together. Step-up compares
  -- against this rather than against session age.
  authenticated_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE INDEX staff_sessions_account_active_idx
  ON staff_sessions(account_id, expires_at)
  WHERE revoked_at IS NULL;

-- A password that has not yet met its second factor buys nothing but a row
-- here. Holding the half-finished state server-side is what stops a client
-- from presenting itself as past the TOTP step.
CREATE TABLE staff_sign_in_challenges (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES accounts(id),
  token_hash BLOB NOT NULL UNIQUE,
  purpose TEXT NOT NULL CHECK (purpose IN ('sign_in', 'step_up')),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT
);

CREATE INDEX staff_sign_in_challenges_expiry_idx
  ON staff_sign_in_challenges(expires_at)
  WHERE consumed_at IS NULL;
