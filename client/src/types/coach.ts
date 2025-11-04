export type Pattern = 'superset'|'straight_sets'|'circuit'|'custom';
export type Mode = 'time'|'reps';
export type ChatterLevel = 'silent'|'minimal'|'high';

export interface BlockParams {
  pattern: Pattern;
  mode: Mode;
  awaitReadyBeforeStart?: boolean;
  partnerAlt?: boolean;
  restBetweenPartnersSec?: number;
  speakCountdownSec?: number;
  safety?: { maxRPE?: number; allowPainProceed?: boolean };
  chatterLevel?: ChatterLevel; // default 'minimal'
}

export interface WorkoutPrefs {
  preflightLoadIntake: boolean;
  strictEMOM: boolean;
  allowAutoExtendRest: false;
  rpeLabels: 'words'|'numbers'|'both';
}

export type Event =
  | { type:'EV_BLOCK_START'; blockId:string }
  | { type:'EV_AWAIT_READY'; blockId:string }
  | { type:'EV_COUNTDOWN'; sec:number }
  | { type:'EV_ROUND_COUNTDOWN'; sec:number }
  | { type:'EV_WORK_PREVIEW'; exerciseId:string; setIndex?: number; totalSets?: number; roundIndex?: number; totalRounds?: number }
  | { type:'EV_WORK_START'; exerciseId:string; setIndex?: number; roundIndex?: number }
  | { type:'EV_TECH_HINT'; exerciseId:string; source:'a2_predicted'|'generic' }
  | { type:'EV_HALFWAY'; exerciseId?:string }
  | { type:'EV_WORK_END'; exerciseId:string; roundIndex?: number }
  | { type:'EV_REST_START'; sec:number; reason?:string }
  | { type:'EV_REST_END' }
  | { type:'EV_ROUND_REST_START'; sec:number; roundIndex?: number }
  | { type:'EV_ROUND_REST_END' }
  | { type:'EV_BLOCK_END'; blockId:string }
  | { type:'EV_WORKOUT_END' };

export interface TimelineContext {
  workoutId: string;
  blockId?: string;
  pattern: Pattern;
  mode: Mode;
  chatterLevel: ChatterLevel;
  prefs: WorkoutPrefs & { repPaceSec?: number };
  nowMs(): number;

  // Block and exercise data for intro generation
  blocks?: Array<{ id: string; params: any; exerciseIds: string[] }>;
  exercises?: Array<{ id: string; name: string }>;

  // data hooks
  getExerciseName(id:string): string;
  getNextExerciseName?(id?:string): string | undefined;

  // Optional: lets coach pull cues for start/tempo lines
  getExerciseMeta?(id:string): {
    id: string|number;
    name: string;
    cues?: string[];
    estimatedTimeSec?: number;
    unilateral?: boolean;
  };

  plannedLoads: Record<string, number | undefined>;

  // ui/system hooks
  showReadyModal?: () => Promise<void>;
  openRestQuickLog?: (exerciseId:string) => void;
  speak?: (text:string) => void;
  beep?: (kind:'start'|'last5'|'end'|'countdown') => void;
  caption?: (text:string) => void;
  haptic?: (kind:'light'|'medium'|'heavy') => void;
}
