// client/src/coach/downstreamTech.ts — schedules A2/A3 technical hints with guards
import { allowDownstream, preferA2ThisRound, hasTimeRemaining, CONF_THRESH, TECH_OFFSET_MS, MIN_REMAINING_SEC } from '@/coach/cuePolicy';
import type { TimelineContext } from '@/types/coach';

export interface DownstreamOpts {
  ctx: TimelineContext;               // has speak(), caption(), chatterLevel, nowMs()
  roundIndex: number;                 // 0‑based
  roundEndMs: number;                 // epoch ms when round ends (GO + roundDur)
  exerciseIds: { A1: string; A2?: string; A3?: string };
  windowsMs: { a2StartMs?: number; a3StartMs?: number }; // window starts (epoch ms)
  confidence: { a2?: number; a3?: number };              // 0..1
  getCue: (exerciseId: string) => string | null;          // returns a short tech cue (2–3 words)
  debug?: (msg: string) => void;                          // optional logger for HUD
}

export function scheduleDownstreamTech(opts: DownstreamOpts){
  const { ctx, roundIndex, roundEndMs, exerciseIds, windowsMs, confidence, getCue, debug } = opts;
  const tids: number[] = [];
  let fired = false;

  if (!allowDownstream((ctx.chatterLevel as any) ?? 'minimal', roundIndex)) {
    debug?.('[tech] skip: chatter!=high or round<R2');
    return () => tids.forEach(clearTimeout);
  }

  const tryFire = (exId: string | undefined, label: 'A2'|'A3', conf: number | undefined) => {
    if (!exId) { debug?.(`[tech] ${label} skip: missing exId`); return; }
    if (fired)  { debug?.(`[tech] ${label} skip: already fired this round`); return; }
    const now = ctx.nowMs ? ctx.nowMs() : Date.now();
    if ((conf ?? 0) < CONF_THRESH){ debug?.(`[tech] ${label} skip: conf ${(conf??0).toFixed(2)} < ${CONF_THRESH}`); return; }
    if (!hasTimeRemaining(now, roundEndMs)){ debug?.(`[tech] ${label} skip: <${MIN_REMAINING_SEC}s remaining`); return; }
    const cue = getCue(exId);
    if (!cue){ debug?.(`[tech] ${label} skip: no cue available`); return; }
    // Speak (voiceBus will guard near beeps; captions always on)
    ctx.caption?.(cue);
    ctx.speak?.(cue);
    debug?.(`[tech] ${label} fired: "${cue}"`);
    fired = true;
  };

  const preferA2 = preferA2ThisRound(roundIndex);

  // A2 slot
  if (windowsMs.a2StartMs){
    const at = Math.max(0, windowsMs.a2StartMs + TECH_OFFSET_MS - Date.now());
    tids.push(window.setTimeout(() => {
      if (preferA2) tryFire(exerciseIds.A2, 'A2', confidence.a2);
      else debug?.('[tech] A2 deferred by alternation');
    }, at));
  }

  // A3 slot — only fires if A2 didn't, or if alternation prefers A3
  if (windowsMs.a3StartMs){
    const at = Math.max(0, windowsMs.a3StartMs + TECH_OFFSET_MS - Date.now());
    tids.push(window.setTimeout(() => {
      if (!fired) tryFire(exerciseIds.A3, 'A3', confidence.a3);
      else debug?.('[tech] A3 skip: A2 already fired');
    }, at));
  }

  return () => tids.forEach(clearTimeout);
}
