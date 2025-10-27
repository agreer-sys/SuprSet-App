// client/src/coach/roundBetweenScheduler.ts
// Canonical "between rounds" timing for rep-round workouts
// Ensures consistent, breathable transitions with no voice/beep collisions

/**
 * Canonical timing constants for round transitions:
 * 
 * Timeline:
 *   T0: End beep (long ~600ms)
 *   T0 + 700ms: "Round rest" voice (beep clears + 100ms safety)
 *   T0 + 3000ms: Next round countdown starts (3-2-1)
 */

// Beep duration + safety margin before starting voice
export const ROUND_END_TO_SPEECH_MS = 700;

// Total gap before next round's countdown
export const ROUND_END_TO_COUNTDOWN_MS = 3000;

/**
 * Schedule round-end events with canonical timing:
 * - End beep at T0
 * - "Round rest" voice at T0 + 700ms
 * 
 * Returns the offset for the next round's countdown (3000ms)
 */
export function scheduleRoundEnd(
  schedule: (ms: number, fn: () => void) => void,
  roundEndMs: number,
  onSpeech: () => void
) {
  // End beep at exactly roundEndMs
  // (caller should schedule this separately with their beep system)
  
  // "Round rest" voice after beep clears
  schedule(roundEndMs + ROUND_END_TO_SPEECH_MS, onSpeech);
  
  // Return when next round should start its countdown
  return roundEndMs + ROUND_END_TO_COUNTDOWN_MS;
}

/**
 * Calculate total round cycle time including rest gap
 */
export function getRoundCycleDuration(roundSec: number): number {
  return roundSec * 1000 + ROUND_END_TO_COUNTDOWN_MS;
}
