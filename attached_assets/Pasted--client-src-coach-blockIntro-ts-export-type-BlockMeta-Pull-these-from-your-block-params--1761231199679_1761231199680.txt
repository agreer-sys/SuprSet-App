// client/src/coach/blockIntro.ts
export type BlockMeta = {
  // Pull these from your block.params (all optional; we handle fallbacks)
  pattern?: 'superset'|'straight_sets'|'circuit'|'emom'|'amrap'|'custom';
  mode?: 'time'|'reps';
  durationSec?: number;
  workSec?: number;
  restSec?: number;
  roundRestSec?: number;
  rounds?: number;            // e.g., 3-4 rounds for time-mode circuits or rep rounds
  setsPerExercise?: number;   // for straight/superset in reps
  exerciseCount?: number;     // block_exercises.length
  patternLabel?: string;      // optional human label override
  guideRoundSec?: number;     // e.g., 180 for 3:00 rep-round guidance
};

function fmtDuration(sec?: number) {
  if (!sec || sec <= 0) return '';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (s === 0) return `${m} min`;
  if (m === 0) return `${s}s`;
  return `${m} min ${s}s`;
}

function computeDuration(meta: BlockMeta): { sec?: number; approx?: boolean } {
  if (meta.durationSec) return { sec: meta.durationSec, approx: false };

  // Time-mode circuits: sum of station windows per round × rounds
  if (meta.mode === 'time' && meta.workSec && meta.restSec && meta.exerciseCount && meta.rounds) {
    const perRound = (meta.workSec + meta.restSec) * meta.exerciseCount + (meta.roundRestSec ?? 0);
    return { sec: perRound * meta.rounds, approx: false };
  }

  // Rep-round guidance (e.g., 3:00 rounds × rounds)
  if (meta.mode === 'reps' && meta.rounds && meta.guideRoundSec) {
    return { sec: meta.rounds * meta.guideRoundSec, approx: true };
  }

  return { sec: undefined, approx: false };
}

export function buildBlockExplainer(meta: BlockMeta, firstName?: string) {
  const pat = meta.patternLabel || (meta.pattern
    ? meta.pattern.replace('_', ' ')
    : 'block');

  const { sec, approx } = computeDuration(meta);
  const duration = sec ? fmtDuration(sec) : '';

  const count = meta.exerciseCount ? `${meta.exerciseCount} exercise${meta.exerciseCount>1?'s':''}` : '';
  const onOff = (meta.mode === 'time' && meta.workSec && meta.restSec)
    ? `${meta.workSec}s on / ${meta.restSec}s off`
    : '';

  // Rep patterns
  const supersetRounds = (meta.pattern === 'superset' && meta.mode === 'reps' && meta.setsPerExercise)
    ? `Superset for ${meta.setsPerExercise} rounds`
    : '';
  const straightSets = (meta.pattern === 'straight_sets' && meta.mode === 'reps' && meta.setsPerExercise)
    ? `Straight sets, ${meta.setsPerExercise} each`
    : '';

  // EMOM/AMRAP labels
  const emom = meta.pattern === 'emom' ? 'EMOM' : '';
  const amrap = meta.pattern === 'amrap' ? 'AMRAP' : '';

  // Build a compact line
  const parts: string[] = [];
  if (firstName) parts.push(`${firstName},`);
  if (emom || amrap) {
    if (emom && duration) parts.push(`${emom} — ${duration}`);
    else if (amrap && duration) parts.push(`${amrap} — ${duration}`);
    else parts.push(pat);
    if (count) parts.push(`— ${count}`);
  } else {
    if (duration) parts.push(`${approx ? 'About ' : ''}${duration} ${pat}`);
    else parts.push(pat.charAt(0).toUpperCase() + pat.slice(1));
    if (count) parts.push(`— ${count}`);
    if (onOff) parts.push(`— ${onOff}`);
    if (supersetRounds) parts.push(`— ${supersetRounds}`);
    if (straightSets) parts.push(`— ${straightSets}`);
  }

  const line = parts.join(' ').replace(/\s+—/g, ' —').replace(/\s+/g, ' ').trim();
  return line;
}
