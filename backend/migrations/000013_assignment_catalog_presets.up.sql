-- The catalog is the coach's preset list, not a record of the one workout the
-- product shipped first. Every approved activity gets an entry, and the two
-- open-ended ones get a second preset so that "pick a workout" and "pick how
-- much of it" are one choice rather than two. Targets stay inside each
-- activity's own minimum_value/maximum_value.

INSERT INTO assignment_catalog
  (key, display_name, activity_definition_id, default_target_value, default_target_unit, approved)
VALUES
  ('timed_run_20', 'Timed Run / Walk (20 min)', 'timed-run-walk', 20, 'minutes', 1),
  ('timed_run_30', 'Timed Run / Walk (30 min)', 'timed-run-walk', 30, 'minutes', 1),
  ('distance_run_1mi', 'Distance Run (1 mile)', 'distance-run', 1, 'miles', 1),
  ('distance_run_2mi', 'Distance Run (2 miles)', 'distance-run', 2, 'miles', 1),
  ('recovery_20', 'Recovery Walk / Jog (20 min)', 'recovery-walk-jog', 20, 'minutes', 1);
