-- Coach Responses Seed Data
-- This file populates the coach_responses table with pattern-aware, mode-aware responses

-- Clear existing data (if reseeding)
TRUNCATE TABLE coach_responses RESTART IDENTITY CASCADE;

-- =========================================
-- EV_BLOCK_START: Block introduction
-- Tokens: {{pattern}}, {{mode}}, {{rounds}}, {{exCount}}, {{cadence}}, {{duration}}, {{firstExercise}}
-- =========================================

-- Rep-based blocks (use cadence)
INSERT INTO coach_responses (event_type, pattern, mode, chatter_level, text_template, priority, cooldown_sec) VALUES
('EV_BLOCK_START', 'any', 'reps', 'minimal', '{{pattern}} — {{rounds}} rounds • cadence {{cadence}}. First up: {{firstExercise}}.', 20, 300),
('EV_BLOCK_START', 'any', 'reps', 'high', '{{pattern}} — {{rounds}} rounds • cadence {{cadence}}. First up: {{firstExercise}}.', 25, 300),
('EV_BLOCK_START', 'any', 'reps', 'high', 'Alright. {{pattern}} — {{rounds}} rounds at {{cadence}}. We start with {{firstExercise}}.', 18, 300);

-- Time-based blocks (use duration)
INSERT INTO coach_responses (event_type, pattern, mode, chatter_level, text_template, priority, cooldown_sec) VALUES
('EV_BLOCK_START', 'any', 'time', 'minimal', '{{pattern}} — {{exCount}} exercises • {{duration}}. First up: {{firstExercise}}.', 20, 300),
('EV_BLOCK_START', 'any', 'time', 'high', '{{pattern}} — {{exCount}} exercises • {{duration}}. First up: {{firstExercise}}.', 25, 300),
('EV_BLOCK_START', 'any', 'time', 'high', 'Time block: {{exCount}} exercises at {{duration}}. Starting with {{firstExercise}}.', 18, 300);

-- =========================================
-- EV_COUNTDOWN: 3-2-1 countdown
-- =========================================
INSERT INTO coach_responses (event_type, pattern, mode, chatter_level, text_template, priority, cooldown_sec) VALUES
('EV_COUNTDOWN', 'any', 'any', 'minimal', 'Get ready', 10, 180),
('EV_COUNTDOWN', 'any', 'any', 'high', 'Here we go in 3, 2, 1', 20, 180),
('EV_COUNTDOWN', 'any', 'any', 'high', 'Prepare yourself. 3, 2, 1', 15, 180);

-- =========================================
-- EV_WORK_START: Beginning work phase
-- =========================================

-- rep-round pattern (A2/A3/A4 style)
INSERT INTO coach_responses (event_type, pattern, mode, chatter_level, text_template, priority, cooldown_sec) VALUES
('EV_WORK_START', 'rep-round', 'any', 'minimal', 'GO', 10, 60),
('EV_WORK_START', 'rep-round', 'any', 'high', 'Let''s go! {{tempoCue}}', 25, 120),
('EV_WORK_START', 'rep-round', 'any', 'high', 'Start your reps. {{tempoCue}}', 20, 120),
('EV_WORK_START', 'rep-round', 'any', 'high', 'GO! Focus on {{tempoCue}}', 15, 120);

-- superset pattern
INSERT INTO coach_responses (event_type, pattern, mode, chatter_level, text_template, priority, cooldown_sec) VALUES
('EV_WORK_START', 'superset', 'any', 'minimal', 'GO', 10, 60),
('EV_WORK_START', 'superset', 'any', 'high', 'Start {{exercise}}. {{cue}}', 20, 120),
('EV_WORK_START', 'superset', 'any', 'high', 'Time to work. {{cue}}', 15, 120);

-- interval/AMRAP pattern
INSERT INTO coach_responses (event_type, pattern, mode, chatter_level, text_template, priority, cooldown_sec) VALUES
('EV_WORK_START', 'interval', 'any', 'minimal', 'GO', 10, 60),
('EV_WORK_START', 'interval', 'any', 'high', 'Let''s move! {{cue}}', 20, 120),
('EV_WORK_START', 'interval', 'any', 'high', 'Start strong. {{cue}}', 15, 120);

-- =========================================
-- EV_WORK_END: Work phase complete
-- =========================================
INSERT INTO coach_responses (event_type, pattern, mode, chatter_level, text_template, priority, cooldown_sec) VALUES
('EV_WORK_END', 'any', 'any', 'silent', '', 100, 0),
('EV_WORK_END', 'any', 'any', 'minimal', 'Done', 10, 120),
('EV_WORK_END', 'any', 'any', 'high', 'Good work', 20, 120),
('EV_WORK_END', 'any', 'any', 'high', 'Nice job', 15, 120);

-- =========================================
-- EV_REST_START: Rest between exercises
-- =========================================
INSERT INTO coach_responses (event_type, pattern, mode, chatter_level, text_template, priority, cooldown_sec) VALUES
('EV_REST_START', 'any', 'any', 'silent', '', 100, 0),
('EV_REST_START', 'any', 'any', 'minimal', 'Rest for {{restSec}} seconds', 10, 180),
('EV_REST_START', 'any', 'any', 'high', 'Take {{restSec}} seconds. Next up: {{next}}', 20, 180),
('EV_REST_START', 'any', 'any', 'high', 'Rest for {{restSec}} seconds. Coming up next: {{next}}', 15, 180);

-- =========================================
-- EV_REST_END: Rest ending (transition coming)
-- =========================================
INSERT INTO coach_responses (event_type, pattern, mode, chatter_level, text_template, priority, cooldown_sec) VALUES
('EV_REST_END', 'any', 'any', 'silent', '', 100, 0),
('EV_REST_END', 'any', 'any', 'minimal', 'Almost time', 10, 120),
('EV_REST_END', 'any', 'any', 'high', 'Get ready for {{next}}', 20, 120);

-- =========================================
-- EV_ROUND_REST_START: Between-rounds micro-rest
-- =========================================
INSERT INTO coach_responses (event_type, pattern, mode, chatter_level, text_template, priority, cooldown_sec) VALUES
('EV_ROUND_REST_START', 'any', 'any', 'silent', '', 100, 0),
('EV_ROUND_REST_START', 'any', 'any', 'minimal', 'Round rest', 10, 60),
('EV_ROUND_REST_START', 'any', 'any', 'high', 'Quick breath. Round {{roundNum}} coming up', 20, 120),
('EV_ROUND_REST_START', 'any', 'any', 'high', 'Reset. Round {{roundNum}} next', 15, 120);

-- =========================================
-- EV_ROUND_REST_END: Round rest ending
-- =========================================
INSERT INTO coach_responses (event_type, pattern, mode, chatter_level, text_template, priority, cooldown_sec) VALUES
('EV_ROUND_REST_END', 'any', 'any', 'silent', '', 100, 0),
('EV_ROUND_REST_END', 'any', 'any', 'minimal', 'Get ready', 10, 60),
('EV_ROUND_REST_END', 'any', 'any', 'high', 'Back to work', 15, 120);

-- =========================================
-- EV_BLOCK_END: Block complete
-- =========================================
INSERT INTO coach_responses (event_type, pattern, mode, chatter_level, text_template, priority, cooldown_sec) VALUES
('EV_BLOCK_END', 'any', 'any', 'silent', '', 100, 0),
('EV_BLOCK_END', 'any', 'any', 'minimal', 'Block complete', 10, 240),
('EV_BLOCK_END', 'any', 'any', 'high', 'Great work on that block', 20, 240),
('EV_BLOCK_END', 'any', 'any', 'high', 'Block complete. Nice effort', 15, 240);

-- =========================================
-- EV_WORKOUT_END: Workout complete
-- =========================================
INSERT INTO coach_responses (event_type, pattern, mode, chatter_level, text_template, priority, cooldown_sec) VALUES
('EV_WORKOUT_END', 'any', 'any', 'minimal', 'Workout complete', 10, 0),
('EV_WORKOUT_END', 'any', 'any', 'high', 'Workout complete. Excellent work today', 20, 0),
('EV_WORKOUT_END', 'any', 'any', 'high', 'That''s it! Great session', 15, 0);

-- =========================================
-- EV_AWAIT_READY: Waiting for user
-- =========================================
INSERT INTO coach_responses (event_type, pattern, mode, chatter_level, text_template, priority, cooldown_sec) VALUES
('EV_AWAIT_READY', 'any', 'any', 'minimal', 'Tap when ready', 10, 180),
('EV_AWAIT_READY', 'any', 'any', 'high', 'Take your time. Tap the screen when you''re ready to continue', 20, 180),
('EV_AWAIT_READY', 'any', 'any', 'high', 'No rush. Hit continue when you''re ready', 15, 180);
