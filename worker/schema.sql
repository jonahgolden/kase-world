CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  score INTEGER NOT NULL,
  level TEXT NOT NULL,
  levels_cleared INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL,
  version TEXT NOT NULL,
  stats TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS scores_score_idx ON scores (score DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS scores_created_idx ON scores (created_at DESC);
