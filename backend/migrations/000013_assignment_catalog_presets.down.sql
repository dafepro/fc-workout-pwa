-- Only the presets this migration added, and only where nothing assigned them:
-- an assignment referencing a catalog key is the parent row's reason to exist.
DELETE FROM assignment_catalog
WHERE key IN ('timed_run_20', 'timed_run_30', 'distance_run_1mi', 'distance_run_2mi', 'recovery_20')
  AND key NOT IN (SELECT catalog_key FROM assignments);
