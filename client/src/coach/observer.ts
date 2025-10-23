// client/src/coach/observer.ts
import { TimelineContext, Event } from '@/types/coach';
import { selectResponse } from '@/coach/responseService';
import { buildBlockExplainer } from '@/coach/blockIntro';

const ALLOW_COUNTDOWN_VOICE_AT_MINIMAL = false;
const SPEAK_MIN_GAP_MS = 5000;
const NAME_COOLDOWN_MS = 90_000;

let lastSpeakAt = 0;
let nameCooldownUntil = 0;

function passesChatterGate(ctx: TimelineContext): boolean {
  return ctx.chatterLevel !== 'silent';
}

function speakOrSignal(ctx: TimelineContext, line: string) {
  ctx.caption?.(line);
  if (ctx.chatterLevel === 'signals') {
    ctx.haptic?.('light');
    return;
  }
  ctx.speak?.(line);
}

function shouldSpeak(): boolean {
  const now = Date.now();
  if (now - lastSpeakAt < SPEAK_MIN_GAP_MS) return false;
  lastSpeakAt = now;
  return true;
}

function pickCue(ctx: TimelineContext, exerciseId?: string): string {
  if (!exerciseId || !ctx.getExerciseMeta) return 'one clean form cue.';
  const cues = ctx.getExerciseMeta(exerciseId)?.cues || [];
  if (!cues.length) return 'one clean form cue.';
  // rotate simply by time (pseudo-random)
  const i = Math.floor((Date.now()/1500) % cues.length);
  return cues[i];
}

function synthesizePromptLine(ctx: TimelineContext, ev: Event): string | null {
  switch (ev.type) {
    case 'EV_BLOCK_START': {
      // Prefer a computed explainer over a generic line
      const includeName = !!ctx.user?.firstName && Date.now() >= nameCooldownUntil;
      const intro = buildBlockExplainer(ctx.blockMeta ?? {}, includeName ? ctx.user?.firstName : undefined);
      if (includeName) nameCooldownUntil = Date.now() + NAME_COOLDOWN_MS;
      return intro || 'Block starting — set up now.';
    }
    case 'EV_COUNTDOWN': {
      if (ALLOW_COUNTDOWN_VOICE_AT_MINIMAL) {
        return `Start in ${(ev.sec ?? 3)}…`;
      }
      // voice off at Minimal; captions can still show countdown elsewhere
      return null;
    }
    case 'EV_WORK_PREVIEW': {
      const name = ctx.getExerciseName((ev as any).exerciseId);
      const si = (ev as any).setIndex; const ri = (ev as any).roundIndex;
      if (typeof si === 'number') return `Set ${si+1} — ${name} coming up.`;
      if (typeof ri === 'number') return `Round ${ri+1} — ${name} next.`;
      return `${name} coming up.`;
    }
    case 'EV_WORK_START': {
      const cue = pickCue(ctx, (ev as any).exerciseId);
      return `Go — ${cue}`;
    }
    case 'EV_WORK_END': return 'Nice work — breathe.';
    case 'EV_REST_START': return 'Rest — log your set.';
    case 'EV_ROUND_REST_START': return 'Round rest — reset and get set.';
    case 'EV_BLOCK_END': return 'Block complete — log your weights.';
    default: return null;
  }
}

export function onEvent(ctx: TimelineContext, ev: Event) {
  if (ev.type === 'EV_AWAIT_READY') { ctx.showReadyModal?.(); return; }

  // Countdown voice policy (mute at Minimal)
  if (ev.type === 'EV_COUNTDOWN' && !ALLOW_COUNTDOWN_VOICE_AT_MINIMAL) {
    // we skip voice; UI can show numeric countdown/beeps
    return;
  }

  if (!passesChatterGate(ctx)) return;

  const line = selectResponse(ctx, ev) ?? synthesizePromptLine(ctx, ev);
  if (!line) return;
  if (!shouldSpeak()) return;

  speakOrSignal(ctx, line);
}
