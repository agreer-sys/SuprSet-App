import { TimelineContext, Event } from '@/types/coach';
import { selectResponse } from '@/coach/responseService';

// Speech queue to prevent overlapping TTS calls
let pendingWorkEndTimer: ReturnType<typeof setTimeout> | null = null;
let speaking = false;
const speakQueue: Array<{text: string}> = [];

function enqueueSpeak(ctx: TimelineContext, text: string) {
  speakQueue.push({ text });
  processSpeakQueue(ctx);
}

function processSpeakQueue(ctx: TimelineContext) {
  if (speaking || speakQueue.length === 0) return;
  speaking = true;
  const { text } = speakQueue.shift()!;
  
  // Always caption
  ctx.caption?.(text);
  
  // Send to TTS
  ctx.speak?.(text);
  
  // Release lock after ~1.5s (average TTS duration)
  setTimeout(() => {
    speaking = false;
    processSpeakQueue(ctx);
  }, 1500);
}

function say(ctx: TimelineContext, line: string) {
  if (ctx.chatterLevel === 'signals') {
    ctx.caption?.(line);
    ctx.haptic?.('light');
    return;
  }
  enqueueSpeak(ctx, line);
}

function passesChatterGate(ctx: TimelineContext): boolean {
  return ctx.chatterLevel !== 'silent';
}

function synthesizePromptLine(ctx: TimelineContext, ev: Event): string | null {
  // Tier‑1 fallback: short, deterministic, event‑aware lines
  switch (ev.type) {
    case 'EV_BLOCK_START': return 'Block starting — set up now.';
    case 'EV_COUNTDOWN': return `Start in ${(ev.sec ?? 3)}…`;
    case 'EV_WORK_START': return 'Go — one clean form cue.';
    case 'EV_WORK_END': return 'Nice work — breathe.';
    case 'EV_REST_START': return 'Rest — log your set.';
    case 'EV_REST_END': return 'Rest over. Lock in.';
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

  // Coalesce: prefer REST_START over WORK_END if both fire together
  if (ev.type === 'EV_WORK_END') {
    const line = selectResponse(ctx, ev) ?? synthesizePromptLine(ctx, ev);
    if (!line) return;
    // Delay slightly; if REST_START arrives, we'll cancel this
    pendingWorkEndTimer = setTimeout(() => {
      say(ctx, line);
      pendingWorkEndTimer = null;
    }, 120);
    return;
  }

  if (ev.type === 'EV_REST_START') {
    if (pendingWorkEndTimer) {
      clearTimeout(pendingWorkEndTimer);
      pendingWorkEndTimer = null; // suppress work_end cue
    }
    const line = selectResponse(ctx, ev) ?? synthesizePromptLine(ctx, ev);
    if (line) say(ctx, line);
    // Open logging UI at rest start
    if (ctx.openRestQuickLog && ctx.mode === 'reps') {
      // In rep‑mode we log during rest
    }
    return;
  }

  // Normal path for all other events
  const line = selectResponse(ctx, ev) ?? synthesizePromptLine(ctx, ev);
  if (!line) return;
  say(ctx, line);
}
