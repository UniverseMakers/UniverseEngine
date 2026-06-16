CREATE TABLE run_selections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  simulation_id TEXT NOT NULL,
  parameters_json TEXT NOT NULL,
  manifest_source TEXT NOT NULL,
  matched_run_id TEXT
);

CREATE INDEX idx_run_selections_created_at
  ON run_selections(created_at);

CREATE INDEX idx_run_selections_simulation_id_created_at
  ON run_selections(simulation_id, created_at);
