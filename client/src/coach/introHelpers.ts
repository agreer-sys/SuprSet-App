// client/src/coach/introHelpers.ts
// Compute block cards (pattern/mode/duration/targets) for Workout Intro UI

export type Pattern = 'superset'|'straight_sets'|'circuit'|'custom';
export type Mode = 'time'|'reps';

export interface BlockLike {
  id: string;
  name?: string;
  params: {
    pattern: Pattern;
    mode: Mode;
    setsPerExercise?: number;
    workSec?: number;
    restSec?: number;
    roundRestSec?: number;
    durationSec?: number;
    targetReps?: string; // e.g., "8-12"
    awaitReadyBeforeStart?: boolean;
  };
}

export interface ExerciseMeta { 
  id: string; 
  name: string;
}

function fmtSec(total: number) {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m ? `${m}m${s ? ` ${s}s` : ''}` : `${s}s`;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function estimateBlockDurationSec(
  block: BlockLike, 
  exCount: number, 
  repPaceSec?: number
): number {
  const p = block.params;
  if (p.durationSec && p.durationSec > 0) return p.durationSec;
  
  const sets = p.setsPerExercise ?? 1;
  
  if (p.mode === 'time') {
    const work = p.workSec ?? 0;
    const rest = p.restSec ?? 0;
    const roundRest = p.roundRestSec ?? 0;
    
    if (p.pattern === 'circuit') {
      const perRound = exCount * (work + rest);
      return sets * perRound + (sets > 1 ? (sets - 1) * roundRest : 0);
    }
    
    // straight or superset: do all sets per exercise before moving on
    return exCount * sets * (work + rest);
  } else {
    // reps: rounds cadence * sets
    const pace = clamp(repPaceSec ?? 180, 90, 600);
    return (p.setsPerExercise ?? 1) * pace;
  }
}

export function patternLabel(p: Pattern) {
  switch (p) {
    case 'superset': return 'Superset';
    case 'straight_sets': return 'Straight Sets';
    case 'circuit': return 'Circuit';
    default: return 'Custom';
  }
}

export function modeLabel(m: Mode) {
  return m === 'time' ? 'Time' : 'Reps';
}

export function exerciseTargetsLine(block: BlockLike, ex: ExerciseMeta): string {
  const p = block.params;
  
  if (p.mode === 'time') {
    const work = p.workSec ?? 0;
    const rest = p.restSec ?? 0;
    const sets = p.setsPerExercise ?? 1;
    return `${ex.name} ${work}/${rest} ×${sets}`;
  } else {
    const reps = p.targetReps ?? '×';
    return `${ex.name} ${reps}`;
  }
}

export function blockSubtitle(
  block: BlockLike, 
  exCount: number, 
  repPaceSec?: number
): string {
  const p = block.params;
  
  if (p.mode === 'time') {
    const work = p.workSec ?? 0;
    const rest = p.restSec ?? 0;
    if (p.pattern === 'circuit') {
      return `${exCount} exercises • ${work}s work / ${rest}s rest`;
    }
    return `${work}s on / ${rest}s off • all sets per exercise`;
  }
  
  const sets = p.setsPerExercise ?? 1;
  const pace = clamp(repPaceSec ?? 180, 90, 600);
  return `Superset ×${sets} rounds • cadence ${Math.floor(pace / 60)}:${String(pace % 60).padStart(2, '0')}`;
}
