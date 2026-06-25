ALTER TABLE run_selections ADD COLUMN asset_host_mode TEXT;

ALTER TABLE run_selections ADD COLUMN asset_host_base TEXT;

UPDATE run_selections
SET
  asset_host_mode = CASE manifest_source
    WHEN 'local' THEN 'local'
    ELSE 'primary'
  END,
  asset_host_base = CASE manifest_source
    WHEN 'local' THEN NULL
    ELSE 'https://media.universemakers.org'
  END
WHERE asset_host_mode IS NULL OR asset_host_base IS NULL;
