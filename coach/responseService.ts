import { TimelineContext, Event } from '@/types/coach';

export interface CoachResponse {
  id: number;
  event_type: string;   // e.g., 'pre_block','countdown','work_start','last5s','rest_start','round_rest','block_end'
  pattern: string;      // specific or 'any'
  mode: string;         // 'time'|'reps'|'any'
  chatter_level: string;// level or 'any'
  locale: string;       // 'en-US'
  text_template: string;// tokens: {{exercise}}, {{next}}, {{restSec}}, {{loadDelta}}, {{count}}, {{sets}}
  priority: number;     // 1..5
  cooldown_sec: number; // 0..n
  active: boolean;
  usage_count: number;
  last_used_at: number | null; // epoch ms
}

// TODO: wire to real DB. Minimal in-memory adapter for now.
let _pool: CoachResponse[] = [];
export function seedResponses(rows: CoachResponse[]) { _pool = rows; }

function mapEvent(ev: Event): string {
  switch (ev.type) {
    case 'EV_BLOCK_START': return 'pre_block';
    case 'EV_COUNTDOWN': return 'countdown';
    case 'EV_WORK_START': return 'work_start';
    case 'EV_WORK_END': return 'work_end';
    case 'EV_REST_START': return 'rest_start';
    case 'EV_ROUND_REST_START': return 'round_rest';
    case 'EV_BLOCK_END': return 'block_end';
    default: return 'misc';
  }
}

function inCooldown(r: CoachResponse, now: number): boolean {
  if (!r.last_used_at) return false;
  return now - r.last_used_at < r.cooldown_sec * 1000;
}

function fit(r: CoachResponse, ctx: TimelineContext, ev: Event): boolean {
  if (!r.active) return false;
  const e = mapEvent(ev);
  const matchEvent = r.event_type === e;
  const matchPattern = r.pattern === 'any' || r.pattern === ctx.pattern;
  const matchMode = r.mode === 'any' || r.mode === ctx.mode;
  const matchChat = r.chatter_level === 'any' || r.chatter_level === ctx.chatterLevel;
  return matchEvent && matchPattern && matchMode && matchChat;
}

function prioritize(rows: CoachResponse[]): CoachResponse | null {
  if (!rows.length) return null;
  // Higher priority first, then lower usage_count
  return rows.sort((a,b) => (b.priority - a.priority) || (a.usage_count - b.usage_count))[0];
}

function renderTemplate(tpl: string, ctx: TimelineContext, ev: Event): string {
  const tokens: Record<string, string | number> = {
    exercise: (ev as any).exerciseId ? ctx.getExerciseName((ev as any).exerciseId) : '',
    next: ctx.getNextExerciseName ? (ctx.getNextExerciseName() || '') : '',
    restSec: (ev as any).sec ?? '',
    count: (ev as any).sec ?? '',
    sets: '',
    loadDelta: ''
  };
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => String(tokens[k] ?? ''));
}

export function selectResponse(ctx: TimelineContext, ev: Event): string | null {
  const now = ctx.nowMs();
  const candidates = _pool.filter(r => fit(r, ctx, ev) && !inCooldown(r, now));
  const pick = prioritize(candidates);
  if (!pick) return null;
  pick.usage_count += 1;
  pick.last_used_at = now;
  return renderTemplate(pick.text_template, ctx, ev);
}
