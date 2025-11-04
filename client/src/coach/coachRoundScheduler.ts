// client/src/coach/coachRoundScheduler.ts
// Canonical rep-round coaching scheduler with full voice + beep coordination

import type { TimelineContext, Event } from '@/types/coach';
import { scheduleDownstreamTech } from '@/coach/downstreamTech';
import { PaceModel } from '@/coach/paceModel';
import { beeps } from '@/coach/beeps';

// Canonical timing constants (match lab exactly)
export const ROUND_END_TO_SPEECH_MS = 700;
export const ROUND_END_TO_COUNTDOWN_MS = 3000;
export const WORK_START_OFFSET_MS = 5600;
export const COUNTDOWN_PIP_INTERVAL_MS = 1000;

export interface RoundSchedulerOpts {
  ctx: TimelineContext;
  roundIndex: number;              // 0-based
  roundSec: number;                // 150, 180, 210, etc.
  roundRestSec: number;            // Rest duration after round (from timeline)
  exercises: Array<{ id: string; name: string }>;
  totalRounds: number;
  emit: (ev: Event) => void;
  getCue: (exerciseId: string) => string | null;
  debug?: (msg: string) => void;
}

export type CancelFn = () => void;

/**
 * Schedule a single rep-based round with canonical transitions:
 * - A1 preview (3s before GO)
 * - 3-2-1-GO beeps
 * - Work period with minute pips, halfway cue, A2 tech cue
 * - Last-10s beeps
 * - End beep → voice @T0+700ms → countdown @T0+3s,4s,5s → rest @T0+5.6s
 * 
 * Returns a cancel() function to clear all timers.
 */
export function scheduleRepRound(opts: RoundSchedulerOpts): CancelFn {
  const { ctx, roundIndex, roundSec, roundRestSec, exercises, totalRounds, emit, getCue, debug } = opts;
  const tids: number[] = [];
  const cancelFns: CancelFn[] = []; // Track cancel functions separately
  const now = Date.now();

  // ========== PRE-ROUND (3s before work starts) ==========
  
  // A1 Preview announcement (T-3s)
  if (ctx.chatterLevel !== 'silent') {
    const previewDelay = 0; // Assumes this is called 3s before work
    tids.push(window.setTimeout(() => {
      emit({ 
        type: 'EV_WORK_PREVIEW', 
        exerciseId: exercises[0]?.id || 'unknown',
        roundIndex,
        totalRounds
      });
    }, previewDelay));
  }

  // Countdown: 3-2-1 (beeps for minimal/silent, suppressed for high)
  if (ctx.chatterLevel !== 'high') {
    [3000, 2000, 1000].forEach((ms, idx) => {
      tids.push(window.setTimeout(() => {
        beeps.play('countdown');
      }, 3000 - ms)); // At T-3s, T-2s, T-1s
    });

    // GO beep (T0)
    tids.push(window.setTimeout(() => {
      beeps.play('start');
    }, 3000));
  }

  // ========== WORK PERIOD STARTS (T0) ==========
  const workStartMs = now + 3000;

  // EV_WORK_START
  tids.push(window.setTimeout(() => {
    emit({ 
      type: 'EV_WORK_START', 
      exerciseId: exercises[0]?.id || 'unknown',
      roundIndex,
      setIndex: roundIndex // For compatibility
    });
  }, 3000));

  // Minute pips (every 60s during work) - beeps for minimal/silent only
  if (ctx.chatterLevel !== 'high') {
    const minuteMarks = [];
    for (let sec = 60; sec < roundSec - 10; sec += 60) {
      minuteMarks.push(sec);
    }
    minuteMarks.forEach(sec => {
      tids.push(window.setTimeout(() => {
        beeps.play('countdown'); // Brief pip
        if (ctx.chatterLevel !== 'silent') {
          const remaining = roundSec - sec;
          ctx.caption?.(`${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} left`);
        }
      }, 3000 + sec * 1000));
    });
  }

  // Halfway cue (50% mark)
  const halfwaySec = Math.floor(roundSec / 2);
  if (halfwaySec > 10 && halfwaySec < roundSec - 10) {
    tids.push(window.setTimeout(() => {
      emit({ type: 'EV_HALFWAY' });
    }, 3000 + halfwaySec * 1000));
  }

  // A2 Technical cue (High chatter, R2+, confidence-gated)
  // Use downstreamTech scheduler for sophisticated A2/A3 logic
  if (exercises.length >= 2) {
    const metas = exercises.map(e => {
      const m = ctx.getExerciseMeta ? ctx.getExerciseMeta(e.id) : undefined;
      return {
        id: e.id,
        name: e.name,
        estimatedTimeSec: m?.estimatedTimeSec ?? 30,
        unilateral: !!m?.unilateral
      };
    });

    const pm = new PaceModel({ roundSec, exercises: metas });
    const windows = pm.computeWindows();

    const a2Window = windows[1];
    const a3Window = windows[2];

    // Store cancel function directly for proper cleanup
    const cancelTech = scheduleDownstreamTech({
      ctx,
      roundIndex,
      roundEndMs: workStartMs + roundSec * 1000,
      exerciseIds: {
        A1: exercises[0]?.id || '',
        A2: exercises[1]?.id,
        A3: exercises[2]?.id
      },
      windowsMs: {
        a2StartMs: a2Window ? workStartMs + a2Window.startSec * 1000 : undefined,
        a3StartMs: a3Window ? workStartMs + a3Window.startSec * 1000 : undefined
      },
      confidence: {
        a2: a2Window?.conf,
        a3: a3Window?.conf
      },
      getCue,
      debug
    });
    cancelFns.push(cancelTech);
  }

  // Last-10s countdown - chatter-aware per patch
  if (ctx.chatterLevel === 'high') {
    // High chatter: Voice cue only (beeps auto-suppressed in beeps.ts)
    tids.push(window.setTimeout(() => {
      emit({ type: 'EV_LAST_10S', roundIndex });
    }, 3000 + (roundSec - 10) * 1000));
  } else {
    // Minimal & Silent: Single ping at 10s
    tids.push(window.setTimeout(() => {
      beeps.play('10s');
    }, 3000 + (roundSec - 10) * 1000));
  }

  // ========== WORK END + CANONICAL TRANSITION ==========

  // End beep (at work completion) - beeps for minimal/silent, voice for high
  tids.push(window.setTimeout(() => {
    if (ctx.chatterLevel !== 'high') {
      beeps.play('end');
    }
    emit({ 
      type: 'EV_WORK_END', 
      exerciseId: exercises[0]?.id || 'unknown',
      roundIndex
    });
  }, 3000 + roundSec * 1000));

  // Voice announcement @T0+700ms (during 600ms beep tail)
  tids.push(window.setTimeout(() => {
    emit({ 
      type: 'EV_ROUND_REST_START',
      sec: roundRestSec, // Use actual rest duration from timeline
      roundIndex
    });
    
    // Between-round coaching (not on final round)
    const isNotFinalRound = roundIndex < totalRounds - 1;
    if (isNotFinalRound && ctx.chatterLevel !== 'silent') {
      // Optional motivational message between rounds
      emit({ type: 'EV_ROUND_COMPLETE', roundIndex });
    }
  }, 3000 + roundSec * 1000 + ROUND_END_TO_SPEECH_MS));

  // Countdown pips @T0+3s, T0+4s, T0+5s - beeps for minimal/silent only
  if (ctx.chatterLevel !== 'high') {
    [3000, 4000, 5000].forEach(ms => {
      tids.push(window.setTimeout(() => {
        beeps.play('countdown');
        emit({ type: 'EV_ROUND_COUNTDOWN', sec: (5000 - ms) / 1000 });
      }, 3000 + roundSec * 1000 + ms));
    });

    // GO beep @T0+5s (before rest period)
    tids.push(window.setTimeout(() => {
      beeps.play('start');
    }, 3000 + roundSec * 1000 + 5000));
  }

  // Rest period starts @T0+5.6s
  // (Timeline player will handle rest step; we just clean up here)

  return () => {
    debug?.(`[scheduler] Cancelling round ${roundIndex + 1}`);
    tids.forEach(clearTimeout);
    cancelFns.forEach(fn => fn()); // Cancel downstream tech cues
  };
}

/**
 * Format round label: "Round 1 of 4", "Round 2 of 4", etc.
 */
export function formatRoundLabel(round: number, total: number): string {
  return `Round ${round} of ${total}`;
}
