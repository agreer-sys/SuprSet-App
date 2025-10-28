// client/src/coach/roundOneScheduler.ts
// Centralized Round 1 timing for rep-round workouts
// Ensures preview fires BEFORE beeps start, with proper guard windows

export interface RoundOneOpts {
  previewLeadMs?: number;      // how early to fire preview (default: 1500ms before first beep)
  onPreview?: () => void;       // preview callback
  onCountdown1?: () => void;    // first countdown beep (T0)
  onCountdown2?: () => void;    // second countdown beep (T0+1000ms)
  onGo?: () => void;            // GO beep (T0+2000ms)
  onWorkStart?: () => void;     // A1 start cue (T0+2200ms)
}

/**
 * Schedule Round 1 events with clean separation:
 * - Preview fires BEFORE beeps (default -1500ms)
 * - Beeps are clean (no voice/captions)
 * - Start cue fires ~200ms after GO beep
 * 
 * Returns cancel function to clear all timers.
 */
export function scheduleRoundOne(opts: RoundOneOpts): () => void {
  const {
    previewLeadMs = 1500,
    onPreview,
    onCountdown1,
    onCountdown2,
    onGo,
    onWorkStart
  } = opts;

  const tids: number[] = [];
  const schedule = (ms: number, fn?: () => void) => {
    if (fn) tids.push(window.setTimeout(fn, ms));
  };

  // Preview fires BEFORE first beep
  schedule(-previewLeadMs, onPreview);

  // Countdown beeps (clean, no voice)
  schedule(0, onCountdown1);
  schedule(1000, onCountdown2);

  // GO beep (clean)
  schedule(2000, onGo);

  // A1 start cue after GO clears
  schedule(2200, onWorkStart);

  return () => tids.forEach(clearTimeout);
}
