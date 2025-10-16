import { TimelineContext, Event } from '@/types/coach';
import { selectResponse } from '@/coach/responseService';

function passesChatterGate(ctx: TimelineContext): boolean {
  return ctx.chatterLevel !== 'silent';
}

function speakOrSignal(ctx: TimelineContext, line: string) {
  if (ctx.chatterLevel === 'signals') {
    // minimal audio cues only
    ctx.caption?.(line);
    ctx.haptic?.('light');
    return;
  }
  ctx.caption?.(line);
  ctx.speak?.(line);
}

function synthesizePromptLine(ctx: TimelineContext, ev: Event): string | null {
  // Tier‑1 fallback: short, deterministic, event‑aware lines
  switch (ev.type) {
    case 'EV_BLOCK_START': return 'Block starting — set up now.';
    case 'EV_COUNTDOWN': return `Start in ${(ev.sec ?? 3)}…`;
    case 'EV_WORK_START': return 'Go — one clean form cue.';
    case 'EV_WORK_END': return 'Nice work — breathe.';
    case 'EV_REST_START': return 'Rest — log your set.';
    case 'EV_REST_END': return 'Rest complete.';
    case 'EV_ROUND_REST_START': return 'Round rest — reset and get set.';
    case 'EV_ROUND_REST_END': return 'Round rest complete.';
    case 'EV_BLOCK_END': return 'Block complete — next block up.';
    case 'EV_WORKOUT_END': return 'Workout complete — great job today!';
    default: return null;
  }
}

export function onEvent(ctx: TimelineContext, ev: Event) {
  // Ready gates
  if (ev.type === 'EV_AWAIT_READY') {
    ctx.showReadyModal && ctx.showReadyModal();
    return; // UI will resume timeline
  }

  // EMOM strictness is enforced by the timeline builder; observer keeps cues tight
  if (!passesChatterGate(ctx)) return;

  const line = selectResponse(ctx, ev) ?? synthesizePromptLine(ctx, ev);
  if (!line) return;
  // throttle policy can live here if needed (e.g., 1 cue / 5s)
  speakOrSignal(ctx, line);

  // Open logging UI at rest start
  if (ev.type === 'EV_REST_START' && ctx.openRestQuickLog && (ctx.mode === 'reps')) {
    // In rep‑mode we log during rest
    // If partnerAlt is used, caller will pass the active exerciseId in a separate event or context
    // Here we assume EV_WORK_END carried it previously; app can store it on ctx
  }
}
