import { TimelineContext, Event } from '@/types/coach';
import { fetchPool, markUsed, type PoolItem } from './responseApi';

export interface CoachResponse {
  id: number;
  event_type: string;   // 'EV_BLOCK_START','EV_COUNTDOWN','EV_WORK_START','EV_WORK_END','EV_REST_START','EV_REST_END','EV_ROUND_REST_START','EV_ROUND_REST_END','EV_BLOCK_END','EV_WORKOUT_END','EV_AWAIT_READY'
  pattern: string;      // specific or 'any'
  mode: string;         // 'rep-round'|'superset'|'interval'|'any'
  chatter_level: string;// 'silent' | 'minimal' | 'high' | 'any'
  locale: string;       // 'en-US'
  text_template: string;// tokens: {{exercise}}, {{next}}, {{restSec}}, {{cue}}, {{tempoCue}}, {{setNum}}, {{roundNum}}
  priority: number;
  cooldown_sec: number;
  active: boolean;
  usage_count: number;
  last_used_at: number | null;
}

// In-memory fallback pool (deprecated, database is primary source)
let _pool: CoachResponse[] = [];
export function seedResponses(rows: CoachResponse[]) { _pool = rows; }

// Map canonical event types to database event_type strings
function mapEventType(ev: Event): string {
  // Canonical events now match database directly
  return ev.type;
}

// Legacy → new chatter mapping for pool rows (for in-memory fallback only)
function normalizeChatterLabel(x: string): 'silent'|'minimal'|'high'|'any' {
  if (x === 'any') return 'any';
  if (x === 'signals') return 'silent';
  if (x === 'standard') return 'high';
  if (x === 'silent' || x === 'minimal' || x === 'high') return x;
  // unknown label → treat as minimal
  return 'minimal';
}

function inCooldown(r: CoachResponse, now: number): boolean {
  if (!r.last_used_at) return false;
  return now - r.last_used_at < (r.cooldown_sec || 0) * 1000;
}

function fit(r: CoachResponse, ctx: TimelineContext, ev: Event): boolean {
  if (!r.active) return false;
  const eventType = mapEventType(ev);
  const matchEvent = r.event_type === eventType;
  const matchPattern = r.pattern === 'any' || r.pattern === ctx.pattern;
  const matchMode = r.mode === 'any' || r.mode === ctx.mode;
  const rowChat = normalizeChatterLabel(r.chatter_level);
  const matchChat = rowChat === 'any' || rowChat === ctx.chatterLevel;
  return matchEvent && matchPattern && matchMode && matchChat;
}

const cueIx: Record<string, number> = {};
function nextCue(cues: string[]|undefined, preferTempo=false){
  if (!cues?.length) return '';
  const pool = preferTempo ? cues.filter(c=>/tempo|cadence|pace|breath/i.test(c)) : cues;
  const usable = pool.length ? pool : cues;
  const idx = (cueIx._ = ((cueIx._ ?? -1) + 1) % usable.length);
  return usable[idx];
}

function renderTemplate(tpl: string, ctx: TimelineContext, ev: Event): string {
  const exId = (ev as any).exerciseId as string | undefined;
  const meta = exId && ctx.getExerciseMeta ? ctx.getExerciseMeta(exId) : undefined;

  const setNum = typeof (ev as any).setIndex === 'number' ? ((ev as any).setIndex + 1) : '';
  const roundNum = typeof (ev as any).roundIndex === 'number' ? ((ev as any).roundIndex + 1) : '';

  const tokens: Record<string, string | number> = {
    exercise: exId ? (meta?.name ?? ctx.getExerciseName(exId)) : '',
    next: ctx.getNextExerciseName ? (ctx.getNextExerciseName() || '') : '',
    restSec: (ev as any).sec ?? '',
    cue: nextCue(meta?.cues, false),
    tempoCue: nextCue(meta?.cues, true),
    setNum,
    roundNum
  };
  return tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => String(tokens[k] ?? ''));
}

// Database-first selection with in-memory fallback
export async function selectResponse(ctx: TimelineContext, ev: Event): Promise<string | null> {
  const now = ctx.nowMs();
  const eventType = mapEventType(ev);
  
  try {
    // Try database first
    const dbResponses = await fetchPool({
      event_type: eventType,
      pattern: ctx.pattern,
      mode: ctx.mode,
      chatter_level: ctx.chatterLevel,
      locale: 'en-US'
    });
    
    if (dbResponses.length > 0) {
      // Filter out responses in cooldown
      const candidates = dbResponses.filter((r: PoolItem) => {
        if (!r.lastUsedAt) return true;
        const lastUsed = new Date(r.lastUsedAt).getTime();
        return now - lastUsed >= r.cooldownSec * 1000;
      });
      
      if (candidates.length > 0) {
        // Sort by priority (desc) then usage count (asc)
        candidates.sort((a: PoolItem, b: PoolItem) => 
          (b.priority - a.priority) || 
          ((a.lastUsedAt ? new Date(a.lastUsedAt).getTime() : 0) - (b.lastUsedAt ? new Date(b.lastUsedAt).getTime() : 0))
        );
        
        const pick = candidates[0];
        
        // Mark as used in database (fire and forget)
        markUsed(pick.id).catch((err: Error) => 
          console.warn('Failed to mark response as used:', err)
        );
        
        return renderTemplate(pick.textTemplate, ctx, ev);
      }
    }
  } catch (error) {
    console.warn('Database query failed, falling back to in-memory pool:', error);
  }
  
  // Fallback to in-memory pool
  const candidates = _pool.filter(r => fit(r, ctx, ev) && !inCooldown(r, now));
  if (!candidates.length) return null;
  candidates.sort((a,b)=> (b.priority - a.priority) || (a.usage_count - b.usage_count));
  const pick = candidates[0];
  pick.usage_count += 1;
  pick.last_used_at = now;
  return renderTemplate(pick.text_template, ctx, ev);
}
