import { TimelineContext, Event } from '@/types/coach';
import { selectResponse } from '@/coach/responseService';
import { beepCtl, scheduleCountdownBeeps, scheduleRestToWorkBeeps, workEndBeep } from '@/coach/beeps';

const ALLOW_VOICE_OVER_BEEP = true; // voice may overlap beeps if true
const ALLOW_COUNTDOWN_VOICE_AT_MINIMAL = false; // NEW: countdown voice gating
const SPEAK_MIN_GAP_MS = 5000; // NEW: throttle (≤1 line / 5s)

let speaking = false;
const speakQueue: Array<{ text: string }> = [];
let pendingWorkEndTimer: ReturnType<typeof setTimeout> | null = null;
let pendingRestEndTimer: ReturnType<typeof setTimeout> | null = null;
let lastSpeakAt = 0; // NEW: for throttle

function passesChatterGate(ctx: TimelineContext): boolean { return ctx.chatterLevel !== 'silent'; }
function scheduleAt(secFromNow: number, fn: ()=>void){ if (secFromNow <= 0) return fn(); setTimeout(fn, secFromNow * 1000); }

function processSpeakQueue(ctx: TimelineContext){
  if (speaking || speakQueue.length === 0) return;
  speaking = true;
  const { text } = speakQueue.shift()!;
  ctx.caption?.(text);
  const start = () => { 
    ctx.speak?.(text); 
    setTimeout(() => { 
      speaking = false; 
      processSpeakQueue(ctx); 
    }, 1500); 
  };
  const now = ctx.nowMs();
  if (!ALLOW_VOICE_OVER_BEEP && now < beepCtl.muteUntil) setTimeout(start, beepCtl.muteUntil - now);
  else start();
}

function say(ctx: TimelineContext, line: string){ 
  // NEW: throttle check
  const now = Date.now();
  if (now - lastSpeakAt < SPEAK_MIN_GAP_MS) {
    console.log('🚫 Throttled:', line);
    return;
  }
  lastSpeakAt = now;
  
  speakQueue.push({ text: line }); 
  processSpeakQueue(ctx); 
}

function synthesizePromptLine(ctx: TimelineContext, ev: Event): string | null {
  switch (ev.type) {
    case 'EV_BLOCK_START': return 'Block starting — set up now.';
    case 'EV_COUNTDOWN': return `Start in ${(ev.sec ?? 3)}…`;
    case 'EV_WORK_PREVIEW': { // NEW: preview with name + set/round
      const name = ctx.getExerciseName((ev as any).exerciseId);
      const si = (ev as any).setIndex; 
      const ri = (ev as any).roundIndex;
      if (typeof si === 'number') return `Set ${si+1} — ${name} coming up.`;
      if (typeof ri === 'number') return `Round ${ri+1} — ${name} next.`;
      return `${name} coming up.`;
    }
    case 'EV_WORK_START': { // Modified: simplified fallback (cue-only in pool)
      return 'Go — focus on form.';
    }
    case 'EV_WORK_END': return 'Nice work — breathe.';
    case 'EV_REST_START': return 'Rest — log your set.';
    case 'EV_REST_END': return 'Rest over. Lock in.';
    case 'EV_ROUND_REST_START': return 'Round rest — reset and get set.';
    case 'EV_BLOCK_END': return 'Block complete — log your weights.';
    default: return null;
  }
}

export function onEvent(ctx: TimelineContext, ev: Event) {
  // Ready gate
  if (ev.type === 'EV_AWAIT_READY') { ctx.showReadyModal?.(); return; }

  // Local beeps (PRESERVED)
  if (ev.type === 'EV_COUNTDOWN' && typeof ev.sec === 'number' && ev.sec <= 5) {
    scheduleCountdownBeeps(scheduleAt, ctx, ev.sec);
  }
  if (ev.type === 'EV_REST_START' && typeof ev.sec === 'number') {
    scheduleRestToWorkBeeps(scheduleAt, ctx, ev.sec);
  }
  if (ev.type === 'EV_WORK_END') {
    workEndBeep(ctx); // long beep at work end
  }

  // NEW: Countdown voice policy
  if (ev.type === 'EV_COUNTDOWN') {
    if (ctx.chatterLevel === 'minimal' && !ALLOW_COUNTDOWN_VOICE_AT_MINIMAL) {
      // captions OK; voice off
      ctx.caption?.(`Start in ${(ev.sec ?? 3)}…`);
      return;
    }
  }

  if (!passesChatterGate(ctx)) return; // silent mode

  // Coalesce #1: prefer REST_START over WORK_END when both arrive together (PRESERVED)
  if (ev.type === 'EV_WORK_END') {
    const line = selectResponse(ctx, ev) ?? synthesizePromptLine(ctx, ev);
    if (!line) return;
    pendingWorkEndTimer = setTimeout(() => { say(ctx, line); pendingWorkEndTimer = null; }, 120);
    return;
  }
  if (ev.type === 'EV_REST_START') {
    if (pendingWorkEndTimer) { clearTimeout(pendingWorkEndTimer); pendingWorkEndTimer = null; }
    const line = selectResponse(ctx, ev) ?? synthesizePromptLine(ctx, ev);
    if (line) say(ctx, line);
    return;
  }

  // Coalesce #2: prefer WORK_START over REST_END when both arrive together (PRESERVED)
  if (ev.type === 'EV_REST_END') {
    const line = selectResponse(ctx, ev) ?? synthesizePromptLine(ctx, ev);
    if (!line) return;
    pendingRestEndTimer = setTimeout(() => { say(ctx, line); pendingRestEndTimer = null; }, 120);
    return;
  }
  if (ev.type === 'EV_WORK_START') {
    if (pendingRestEndTimer) { clearTimeout(pendingRestEndTimer); pendingRestEndTimer = null; }
    const line = selectResponse(ctx, ev) ?? synthesizePromptLine(ctx, ev);
    if (line) say(ctx, line);
    return;
  }

  // NEW: Handle EV_WORK_PREVIEW (no coalescing needed)
  if (ev.type === 'EV_WORK_PREVIEW') {
    const line = selectResponse(ctx, ev) ?? synthesizePromptLine(ctx, ev);
    if (line) say(ctx, line);
    return;
  }

  // Default: all other events
  const line = selectResponse(ctx, ev) ?? synthesizePromptLine(ctx, ev);
  if (line) say(ctx, line);
}
