ALTER TABLE team_lounge_placement_credits ADD COLUMN reservation_id TEXT;
ALTER TABLE team_lounge_placement_credits ADD COLUMN idempotency_key_hash BLOB;
ALTER TABLE team_lounge_placement_credits ADD COLUMN request_hash BLOB;
ALTER TABLE team_lounge_placement_credits ADD COLUMN definition_id TEXT;
ALTER TABLE team_lounge_placement_credits ADD COLUMN position_x REAL;
ALTER TABLE team_lounge_placement_credits ADD COLUMN position_y REAL;
ALTER TABLE team_lounge_placement_credits ADD COLUMN placement_state TEXT CHECK (placement_state IN ('reserved', 'placed'));
ALTER TABLE team_lounge_placement_credits ADD COLUMN entity_id TEXT;
ALTER TABLE team_lounge_placement_credits ADD COLUMN reserved_at TEXT;
ALTER TABLE team_lounge_placement_credits ADD COLUMN placed_at TEXT;

CREATE UNIQUE INDEX team_lounge_placement_reservations
  ON team_lounge_placement_credits(player_id, idempotency_key_hash)
  WHERE idempotency_key_hash IS NOT NULL;

CREATE UNIQUE INDEX team_lounge_placement_reservation_ids
  ON team_lounge_placement_credits(reservation_id)
  WHERE reservation_id IS NOT NULL;
