export interface PacingInput { id: string; name: string; estimatedTimeSec?: number; }
export interface PacingSeg { tStartSec: number; tEndSec: number; exerciseId: string; }

const UNILATERAL_HINT = /(single|one[- ]?arm|one[- ]?leg|curtsy|split|side)/i;

export function allocateRoundWindows(exs: PacingInput[], totalSec: number, transitionBufferSec = 3): PacingSeg[] {
  const n = exs.length;
  if (n === 0 || totalSec <= 0) return [];

  // Reserve tiny transitions between windows (n-1 gaps)
  const totalTransition = Math.max(0, (n - 1) * transitionBufferSec);
  const workBudget = Math.max(0, totalSec - totalTransition);

  const weights = exs.map(e => {
    const base = Math.max(5, e.estimatedTimeSec ?? (totalSec / n));
    const unilateral = UNILATERAL_HINT.test(e.name) ? 2 : 1;
    return base * unilateral;
  });
  const sum = weights.reduce((a,b)=>a+b,0) || 1;

  let t = 0;
  const segs: PacingSeg[] = [];
  exs.forEach((e, i) => {
    const window = Math.round((weights[i] / sum) * workBudget);
    const start = t;
    const end = start + window;
    segs.push({ tStartSec: start, tEndSec: end, exerciseId: e.id });
    t = end;
    if (i < n - 1) t += transitionBufferSec; // micro-handoff
  });

  // Normalize last end to totalSec
  if (segs.length) segs[segs.length - 1].tEndSec = totalSec;
  return segs;
}
