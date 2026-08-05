ALTER TABLE reactions
  ADD COLUMN remaining_after_send INTEGER NOT NULL DEFAULT 0
  CHECK (remaining_after_send BETWEEN 0 AND 4);
