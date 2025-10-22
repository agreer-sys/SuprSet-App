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
('rest_start','any','reps','minimal','Nice set. Log reps & load; tap "Use last values" if unchanged.',5),
('work_start','any','time','minimal','{{exercise}} — {{cue}}',4),
('last5s','any','time','minimal','Last five — {{tempoCue}}',4),
('rest_end','any','any','minimal','Time. Back to {{exercise}}—lock in.',4),

-- NEW: PREVIEW (name + set/round)
('work_preview','any','reps','minimal','Set {{setNum}} — {{exercise}} coming up.', 5),
('work_preview','any','time','minimal','Round {{roundNum}} — {{exercise}} next.', 5),

-- NEW: START (cue only)
('work_start','any','any','minimal','Go — {{cue}}.', 5),
('work_start','any','any','minimal','Move — {{cue}}.', 4),
('work_start','any','any','minimal','Drive — {{cue}}.', 4),

-- NEW: LAST 5s (tempo/breath cue only)
('last5s','any','any','minimal','Last five — {{tempoCue}}.', 5);
