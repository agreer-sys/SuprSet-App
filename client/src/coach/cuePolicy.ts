// client/src/coach/cuePolicy.ts — guard constants & simple policy helpers
export const CONF_THRESH = 0.70;         // ≥70% confidence to speak
export const MIN_REMAINING_SEC = 20;     // must have ≥20s left in round
export const TECH_OFFSET_MS = 3000;      // fire ~3s after window start
export const BEEP_GUARD_MS = 250;        // speech starts avoid ±250ms of beeps (handled by voiceBus.guard)
export const ALTERNATE_TECH_HINT = true; // if true: odd rounds→A2, even→A3 (1‑based)

export type ChatterLevel = 'silent'|'minimal'|'high';

export function allowDownstream(chatter: ChatterLevel, roundIndex: number){
  return chatter === 'high' && roundIndex >= 1; // R2+
}

export function preferA2ThisRound(roundIndex: number){
  if (!ALTERNATE_TECH_HINT) return true; // default to A2 if not alternating
  const round1Based = roundIndex + 1;
  return round1Based % 2 === 1; // odd→A2, even→A3
}

export function hasTimeRemaining(nowMs: number, roundEndMs: number){
  return (roundEndMs - nowMs) / 1000 >= MIN_REMAINING_SEC;
}
