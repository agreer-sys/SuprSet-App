CREATE TABLE IF NOT EXISTS coach_responses (
  id SERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  pattern TEXT DEFAULT 'any',
  mode TEXT DEFAULT 'any',
  chatter_level TEXT DEFAULT 'any',
  locale TEXT DEFAULT 'en-US',
  text_template TEXT NOT NULL,
  priority INT DEFAULT 3,
  cooldown_sec INT DEFAULT 30,
  active BOOLEAN DEFAULT TRUE,
  usage_count INT DEFAULT 0,
  last_used_at TIMESTAMP NULL
);

INSERT INTO coach_responses (event_type, pattern, mode, chatter_level, text_template, priority) VALUES
('pre_block','any','reps','minimal','Superset: {{exercise}} then {{next}} — {{sets}} sets, {{restSec}}s rest. Set 1 in {{count}}…',4),
('last5s','any','time','minimal','Last five — finish clean, breathe.',3),
('rest_start','any','reps','minimal','Nice set. Log reps & load; tap "Use last values" if unchanged.',5);
