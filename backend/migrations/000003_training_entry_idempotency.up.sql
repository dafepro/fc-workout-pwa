ALTER TABLE training_entries ADD COLUMN idempotency_key TEXT;

CREATE UNIQUE INDEX training_entries_player_idempotency_unique
  ON training_entries(player_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
