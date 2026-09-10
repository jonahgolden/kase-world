DROP TABLE IF EXISTS scores;
CREATE TABLE IF NOT EXISTS times (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,             -- 'level' (one continent) or 'world' (all seven in one run)
  level TEXT NOT NULL,            -- level id for kind='level', 'world' for kind='world'
  time_ms INTEGER NOT NULL,       -- level clear time, or full run time for 'world'
  levels_cleared INTEGER NOT NULL DEFAULT 0,
  version TEXT NOT NULL,
  stats TEXT,
  ip_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS times_board_idx ON times (kind, level, time_ms ASC, created_at ASC);
