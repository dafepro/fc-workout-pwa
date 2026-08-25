ALTER TABLE training_entries
  ADD COLUMN completion_outcome TEXT
  CHECK (completion_outcome IN ('as_listed', 'partial', 'extra'));

ALTER TABLE training_entries
  ADD COLUMN note TEXT
  CHECK (length(note) <= 500);
