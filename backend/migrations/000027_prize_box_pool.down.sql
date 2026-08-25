DROP INDEX daily_drop_claims_player_open_key;
ALTER TABLE plan_prize_box_grants DROP COLUMN opened_at;
ALTER TABLE daily_drop_claims DROP COLUMN open_idempotency_key_hash;
ALTER TABLE daily_drop_claims DROP COLUMN opened_at;
