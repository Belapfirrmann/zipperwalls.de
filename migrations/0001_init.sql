CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  hashtags TEXT NOT NULL DEFAULT '[]',
  variants TEXT NOT NULL DEFAULT '{}',
  channels TEXT NOT NULL DEFAULT '["facebook","instagram","linkedin"]',
  image_key TEXT,
  image_url TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TEXT,
  approved_by TEXT,
  approved_at TEXT,
  source TEXT NOT NULL DEFAULT 'agent',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_posts_status ON posts(status, scheduled_at);

CREATE TABLE post_results (
  post_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  status TEXT NOT NULL,
  external_id TEXT,
  url TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  stats TEXT,
  stats_at TEXT,
  PRIMARY KEY (post_id, channel)
);

CREATE TABLE checklist (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  week TEXT,
  label TEXT NOT NULL,
  pos INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  done_by TEXT,
  done_at TEXT
);
CREATE INDEX idx_checklist_week ON checklist(kind, week);

CREATE TABLE metrics (
  channel TEXT NOT NULL,
  date TEXT NOT NULL,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  PRIMARY KEY (channel, date, metric)
);

CREATE TABLE tokens (
  channel TEXT PRIMARY KEY,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  expires_at TEXT,
  meta TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
