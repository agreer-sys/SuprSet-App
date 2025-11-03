import { TimelineContext, Event } from '@/types/coach';
import { selectResponse } from '@/coach/responseService';
import { buildBlockIntroLine } from '@/coach/introTokens';

const SPEAK_MIN_GAP_MS = 5000;   // throttle
const COUNTDOWN_VOICE_OFF = true; // beeps handle countdown by default

let lastSpeakAt = 0;

function canSpeakNow(): boolean {
  const now = Date.now();
  if (now - lastSpeakAt < SPEAK_MIN_GAP_MS) return false;
  lastSpeakAt = now;
  return true;
}

function speak(ctx: TimelineContext, text: string) {
  ctx.caption?.(text);                 // captions always OK
  if (ctx.chatterLevel === 'silent') return; // no voice at silent
  ctx.speak?.(text);
}

function synthesizePromptLine(ctx: TimelineContext, ev: Event): string | null {
  switch (ev.type) {
    case 'EV_BLOCK_START': {
      // Fallback: Build a proper block introduction using block params
      // This is used if DB lookup fails
      if (ctx.blocks && ctx.exercises) {
        const block = ctx.blocks.find(b => b.id === ev.blockId);
        if (block) {
          return buildBlockIntroLine(block, ctx.exercises, ctx.prefs.repPaceSec);
        }
      }
      return 'Block starting — set up now.';
    }

    case 'EV_WORK_PREVIEW': {
      const name = ctx.getExerciseName(ev.exerciseId);
      const si = (ev as any).setIndex; const ri = (ev as any).roundIndex;
      if (typeof si === 'number') return `Set ${si+1} — ${name} coming up.`;
      if (typeof ri === 'number') return `Round ${ri+1} — ${name} next.`;
      return `${name} coming up.`;
    }

    case 'EV_WORK_START': {
      // Cue-only (no exercise name - preview already announced it)
      const meta = ctx.getExerciseMeta?.(ev.exerciseId);
      const cue = meta?.cues?.[0]; // Use first cue if available
      return cue ? `${cue}` : 'Go — tight and controlled.';
    }

    case 'EV_TECH_HINT': {
      // High chatter only: a short technical line for A2 when we're confident
      if (ctx.chatterLevel !== 'high') return null;
      const meta = ctx.getExerciseMeta?.(ev.exerciseId);
      const name = meta?.name ?? ctx.getExerciseName(ev.exerciseId);
      // keep it cue-only; name is present for text logs only
      return `Keep it crisp — ${name.toLowerCase().includes('lunge') ? 'knee tracks mid-foot; torso tall.' : 'control the descent; own the range.'}`;
    }

    case 'EV_HALFWAY':     return 'Halfway — smooth tempo.';
    case 'EV_WORK_END':    return 'Nice work — breathe.';
    case 'EV_REST_START':  return 'Rest — log your set.';
    case 'EV_ROUND_REST_START': return 'Round rest — reset and get set.';
    case 'EV_BLOCK_END':   return 'Block complete — next block up.';
    default: return null;
  }
}

export async function onEvent(ctx: TimelineContext, ev: Event) {
  // Ready gate - DISABLED: No popup, workout UI handles Ready button
  // if (ev.type === 'EV_AWAIT_READY') { ctx.showReadyModal?.(); return; }

  // Countdown voice policy
  if (ev.type === 'EV_COUNTDOWN' && COUNTDOWN_VOICE_OFF) return;

  // Gate halfway: High only
  if (ev.type === 'EV_HALFWAY' && ctx.chatterLevel !== 'high') return;

  const line = (await selectResponse(ctx, ev)) ?? synthesizePromptLine(ctx, ev);
  if (!line) return;
  if (!canSpeakNow()) return;

  speak(ctx, line);
}
