import type { TimelineContext } from '@/types/coach';

// Shared state used by observer to avoid speaking over beeps (when desired)
export const beepCtl = { muteUntil: 0 };

// Map to your app's beep kinds: 'countdown' (short), 'start' (long at GO), 'end' (long at work end)
function kindDuration(kind: 'countdown'|'start'|'end'){ return kind === 'countdown' ? 250 : 500; }

export function playBeep(ctx: TimelineContext, kind: 'countdown'|'start'|'end', padMs = 120){
  ctx.beep?.(kind);
  const dur = kindDuration(kind);
  beepCtl.muteUntil = Math.max(beepCtl.muteUntil, ctx.nowMs() + dur + padMs);
}

// scheduleAt: (delaySec:number, fn:()=>void) => void
export function scheduleCountdownBeeps(scheduleAt: (atSec:number, fn:()=>void)=>void, ctx: TimelineContext, totalSec:number){
  if (totalSec >= 2) scheduleAt(totalSec - 2, () => playBeep(ctx,'countdown'));
  if (totalSec >= 1) scheduleAt(totalSec - 1, () => playBeep(ctx,'countdown'));
  scheduleAt(0, () => playBeep(ctx,'start')); // GO
}

export function scheduleRestToWorkBeeps(scheduleAt: (atSec:number, fn:()=>void)=>void, ctx: TimelineContext, restSec:number){
  if (restSec >= 2) scheduleAt(restSec - 2, () => playBeep(ctx,'countdown'));
  if (restSec >= 1) scheduleAt(restSec - 1, () => playBeep(ctx,'countdown'));
  scheduleAt(0, () => playBeep(ctx,'start')); // work start
}

export function workEndBeep(ctx: TimelineContext){
  playBeep(ctx,'end');
}
