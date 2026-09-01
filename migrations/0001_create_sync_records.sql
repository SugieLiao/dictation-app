CREATE TABLE IF NOT EXISTS sync_records (
  record_key TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
