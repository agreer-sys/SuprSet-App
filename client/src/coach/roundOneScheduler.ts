// client/src/coach/roundOneScheduler.ts
// Round 1: preview (optional) → 3-2-1 → GO with proper guard windows
import type { TimelineContext } from '@/types/coach';

export interface RoundOneOpts {
  ctx: TimelineContext;
  goAtMs: number;                        // epoch ms for GO beep
  emit: (ev: any) => void;
  previewExerciseId?: string;            // A1 id
  enablePreview?: boolean;               // default false for Minimal
  previewLeadMs?: number;                // default 1000ms before first pip
  emitCountdownEvents?: boolean;         // optional countdown events
  onGo?: () => void;                     // fire A1 start cue ~200-300ms after GO
  totalRounds?: number;                  // optional
}

/**
 * Schedule Round 1 events with clean separation:
 * - Preview fires ≥1s BEFORE first beep (if enabled)
 * - Beeps are clean (no voice/captions during countdown)
 * - Start cue fires ~220ms after GO beep
 * 
 * Returns cancel function to clear all timers.
 */
export function scheduleRoundOne(opts: RoundOneOpts): () => void {
  const { 
    ctx, goAtMs, emit, previewExerciseId, enablePreview = false, 
    previewLeadMs = 1000, emitCountdownEvents = false, onGo, totalRounds 
  } = opts;
  
  const tids: number[] = [];
  const at = (ms: number, fn: () => void) => tids.push(window.setTimeout(fn, Math.max(0, ms)));

  // Countdown pips: -2000ms, -1000ms; GO at 0ms (relative to goAtMs)
  const c1At = goAtMs - 2000;
  const c2At = goAtMs - 1000;
  const previewAt = goAtMs - (2000 + previewLeadMs); // e.g., 1s before first pip

  // Optional preview (skip if no exercise id)
  if (enablePreview && previewExerciseId) {
    at(previewAt - Date.now(), () => {
      emit({ 
        type: 'EV_WORK_PREVIEW', 
        exerciseId: previewExerciseId, 
        roundIndex: 0, 
        totalRounds 
      });
    });
  }

  at(c1At - Date.now(), () => { 
    ctx.beep?.('countdown'); 
    if (emitCountdownEvents) emit({ type: 'EV_COUNTDOWN', sec: 3 }); 
  });
  
  at(c2At - Date.now(), () => { 
    ctx.beep?.('countdown'); 
    if (emitCountdownEvents) emit({ type: 'EV_COUNTDOWN', sec: 2 }); 
  });
  
  at(goAtMs - Date.now(), () => { 
    ctx.beep?.('start'); 
    onGo?.(); 
  });

  return () => tids.forEach(clearTimeout);
}
