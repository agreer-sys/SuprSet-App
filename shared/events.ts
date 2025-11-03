/**
 * Event Bus Infrastructure - Canonical Timeline Events
 * 
 * Decouples timeline player from coach observer using EventEmitter3.
 * The player emits standardized events, and the coach observes.
 */

import type { ExerciseMeta } from "./timeline";

// Canonical event types for workout progression
export type TimelineEvent =
  | { type: "EV_WORKOUT_START"; meta: { workoutName: string } }
  | { type: "EV_WORK_START"; meta: { exercise: ExerciseMeta; set: number; round: number } }
  | { type: "EV_WORK_HALFWAY"; meta: { exercise: ExerciseMeta; set: number; round: number } }
  | { type: "EV_WORK_LAST_5S"; meta: { exercise: ExerciseMeta; set: number; round: number } }
  | { type: "EV_WORK_END"; meta: { exercise: ExerciseMeta; set: number; round: number } }
  | { type: "EV_REST_START"; meta: { restSec: number; nextExercise?: ExerciseMeta } }
  | { type: "EV_REST_END"; meta: { nextExercise?: ExerciseMeta } }
  | { type: "EV_ROUND_REST_START"; meta: { roundRestSec: number; nextRound: number } }
  | { type: "EV_ROUND_REST_END"; meta: { nextRound: number } }
  | { type: "EV_WORKOUT_COMPLETE"; meta: { workoutName: string; totalDurationSec: number } }
  | { type: "EV_PAUSE"; meta: { atMs: number } }
  | { type: "EV_RESUME"; meta: { atMs: number } };

// Coach-specific events (user-triggered)
export type CoachEvent =
  | { type: "USER_READY"; meta: { timestamp: number } }
  | { type: "USER_REPS_LOGGED"; meta: { reps: number; exercise: ExerciseMeta } }
  | { type: "USER_FORM_ISSUE"; meta: { issue: string; exercise: ExerciseMeta } };

export type AllEvents = TimelineEvent | CoachEvent;

/**
 * Type-safe event emitter for timeline and coach events
 */
export interface EventBus {
  emit<E extends AllEvents>(event: E["type"], data: E["meta"]): void;
  on<E extends AllEvents>(event: E["type"], handler: (data: E["meta"]) => void): void;
  off<E extends AllEvents>(event: E["type"], handler: (data: E["meta"]) => void): void;
  once<E extends AllEvents>(event: E["type"], handler: (data: E["meta"]) => void): void;
}
