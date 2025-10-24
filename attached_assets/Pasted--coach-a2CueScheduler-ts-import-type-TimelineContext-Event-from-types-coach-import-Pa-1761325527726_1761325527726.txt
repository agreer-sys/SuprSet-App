// /coach/a2CueScheduler.ts
import type { TimelineContext, Event } from '@/types/coach';
import { PaceModel } from '@/coach/paceModel';

export type CancelFn = () => void;

/**
 * Schedule a single A2 technical cue (High chatter only) at ~A2_start + 15s,
 * with a >=70% confidence gate and beep collision avoidance.
 *
 * Returns a cancel() you should call if the user taps "Round done" early.
 */
export function scheduleA2TechnicalCue(opts:{
  ctx: TimelineContext;
  roundStartMs: number;            // Date.now() when the round started
  roundSec: number;                // 150, 180, 210, etc.
  roundIndex: number;              // 0-based
  exercises: Array<{ id:string }>; // order within the superset (A1,A2,[A3...])
  emit: (ev: Event) => void;
}): CancelFn {
  const { ctx, roundStartMs, roundSec, roundIndex, exercises, emit } = opts;

  // Only in High chatter, rounds 2+ (i.e., after we "learn" Round 1 pace surrogate).
  if (ctx.chatterLevel !== 'high' || roundIndex < 1) return () => {};

  // Need at least two movements to define A2
  if (!exercises || exercises.length < 2) return () => {};

  // Build pacing model from exercise meta (estimated times + unilateral)
  const metas = exercises.map(e => {
    const m = ctx.getExerciseMeta ? ctx.getExerciseMeta(e.id) : undefined;
    return {
      id: e.id,
      name: m?.name ?? ctx.getExerciseName(e.id),
      estimatedTimeSec: m?.estimatedTimeSec ?? 30,
      unilateral: !!m?.unilateral
    };
  });

  const pm = new PaceModel({ roundSec, exercises: metas });
  const windows = pm.computeWindows();

  // Find A2 window
  const a2 = windows[1];
  if (!a2) return () => {};

  // Confidence gate: need >= 0.7 AND window long enough (>= 25s)
  const conf = a2.conf;
  if (conf < 0.7 || a2.durSec < 25) return () => {};

  // Target fire time: A2 start + ~15s (settled into movement)
  const fireAtSec = a2.startSec + Math.min(20, Math.max(10, Math.round(a2.durSec * 0.3)));

  // Collision guards:
  // - avoid GO zone (first 3s)
  // - avoid last-10s zone
  if (fireAtSec < 3) return () => {};
  if (fireAtSec > roundSec - 12) return () => {}; // leave space before last-10s beeps

  const delayMs = Math.max(0, roundStartMs + fireAtSec * 1000 - Date.now());
  const tid = window.setTimeout(() => {
    emit({ type:'EV_TECH_HINT', exerciseId: a2.id, source: 'a2_predicted' });
  }, delayMs);

  return () => window.clearTimeout(tid);
}
