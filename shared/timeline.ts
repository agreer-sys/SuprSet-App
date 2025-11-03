import { z } from "zod";

export const Pattern = z.enum(["superset", "straight_sets", "circuit", "custom"]);
export const Mode = z.enum(["time", "reps"]);

const Common = {
  setsPerExercise: z.number().int().positive().default(3),
  workSec: z.number().int().positive().default(30),
  restSec: z.number().int().nonnegative().default(30),
  roundRestSec: z.number().int().nonnegative().default(0),
  transitionSec: z.number().int().nonnegative().default(0),
  targetReps: z.string().optional(),
  awaitReadyBeforeStart: z.boolean().default(false),
  postCardio: z.object({ exercise: z.string(), durationSec: z.number().int().positive() }).optional(),
  minuteMarks: z.array(z.number().int().positive()).optional(),
  maxDuration: z.number().int().positive().optional(),
};

export const CustomSequenceParams = z.object({
  type: z.literal("custom_sequence"),
  pattern: Pattern,
  mode: Mode,
  ...Common,
});

export const TransitionParams = z.object({
  type: z.literal("transition"),
  durationSec: z.number().int().nonnegative(),
});

export const AmrapParams = z.object({
  type: z.literal("amrap_loop"),
  maxDuration: z.number().int().positive(),
});

export const EmomParams = z.object({
  type: z.literal("emom_window"),
  minuteMarks: z.array(z.number().int().nonnegative()),
});

export const BlockParams = z.discriminatedUnion("type", [
  CustomSequenceParams,
  TransitionParams,
  AmrapParams,
  EmomParams,
]);

export type BlockParamsT = z.infer<typeof BlockParams>;

export type StepType = "countdown" | "work" | "rest" | "round_rest" | "await_ready" | "transition" | "amrap" | "emom" | "instruction";

export interface ExerciseMeta {
  id: number;
  name: string;
  cues?: string[];
  equipment?: string[];
  muscleGroup?: string;
  videoUrl?: string;
  imageUrl?: string;
}

export interface TimelineStep {
  step: number;
  type: StepType;
  atMs: number;
  endMs: number;
  durationSec?: number;
  label?: string;
  text?: string;
  set?: number;
  round?: number;
  exercise?: ExerciseMeta;
  exercises?: ExerciseMeta[];
  coachPrompt?: string;
  nextStepId?: string;
  preWorkout?: boolean;
  meta?: Record<string, any>;
}

export interface CompileOptions {
  startAtMs?: number;
  countdownSec?: number;
  includeIntro?: boolean;
  workoutName?: string;
  workoutStructure?: string;
  guardGapsMs?: { postBeepToVoice: number; voiceToNextCountdown: number };
}

export interface ExecutionTimeline {
  workoutHeader: {
    name: string;
    totalDurationSec: number;
    structure: string;
    preWorkoutDurationMs?: number;
  };
  executionTimeline: TimelineStep[];
  sync: {
    workoutStartEpochMs: number;
    resyncEveryMs: number;
    allowedDriftMs: number;
  };
}
