ALTER TABLE daily_drop_claims ADD COLUMN opened_at TEXT;
ALTER TABLE daily_drop_claims ADD COLUMN open_idempotency_key_hash BLOB
  CHECK (open_idempotency_key_hash IS NULL OR length(open_idempotency_key_hash) = 32);

UPDATE daily_drop_claims
SET opened_at = claimed_at
WHERE opened_at IS NULL;

CREATE UNIQUE INDEX daily_drop_claims_player_open_key
  ON daily_drop_claims(player_id, open_idempotency_key_hash)
  WHERE open_idempotency_key_hash IS NOT NULL;

ALTER TABLE plan_prize_box_grants ADD COLUMN opened_at TEXT;

UPDATE plan_prize_box_grants
SET opened_at = claimed_at
WHERE claimed_at IS NOT NULL AND opened_at IS NULL;
