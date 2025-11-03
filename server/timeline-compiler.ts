/**
 * Timeline Compiler Service
 * 
 * Transforms flexible Block-based workouts into flat ExecutionTimelines
 * with absolute timestamps for the AI Coach to follow.
 * 
 * Key responsibilities:
 * - Expand rounds/sets (3 exercises × 3 rounds = 9 timeline steps)
 * - Calculate absolute timestamps (atMs, endMs)
 * - Insert transitions, rest periods, await_ready steps
 * - Validate timeline integrity
 * - Apply canonical between-rounds timing for rep-round workouts
 */

import type { Block, BlockExercise } from "@shared/schema";

// Canonical between-rounds timing (matches client/src/coach/roundBetweenScheduler.ts)
const ROUND_END_TO_SPEECH_MS = 700;    // Voice after beep clears
const ROUND_END_TO_COUNTDOWN_MS = 3000; // First countdown pip (3)
const COUNTDOWN_INTERVAL_MS = 1000;    // Between pips (3→2→1)
const GO_BEEP_OFFSET_MS = 5000;        // GO beep (long 600ms beep)
const WORK_START_OFFSET_MS = 5600;     // Work starts 600ms after GO (beep duration)

// Step types supported by the coach
export type StepType = 
  | "instruction" 
  | "work" 
  | "rest"
  | "round_rest"
  | "countdown"
  | "transition" 
  | "await_ready" 
  | "hold" 
  | "amrap_loop" 
  | "emom_window";

export interface TimelineStep {
  step: number;
  type: StepType;
  text?: string;
  exercise?: {
    id: number;
    name: string;
    cues: string[];
    equipment: string[];
    muscleGroup: string;
    videoUrl?: string;
    imageUrl?: string;
  };
  atMs: number;
  endMs: number;
  durationSec?: number;
  set?: number;
  round?: number;
  label?: string;
  nextStepId?: string;
  coachPrompt?: string;
  preWorkout?: boolean; // Flag for steps before workout timer starts
}

export interface ExecutionTimeline {
  workoutHeader: {
    name: string;
    totalDurationSec: number;
    structure: string;
    preWorkoutDurationMs?: number; // Duration of intro/countdown before workout timer starts
  };
  executionTimeline: TimelineStep[];
  sync: {
    workoutStartEpochMs: number;
    resyncEveryMs: number;
    allowedDriftMs: number;
  };
}

export interface CompileOptions {
  workoutName: string;
  workoutStructure?: string;
  includeIntro?: boolean;
}

/**
 * Main compiler function
 * Transforms a Block with exercises into a flat ExecutionTimeline
 */
export async function compileBlockToTimeline(
  block: Block & { exercises: BlockExercise[] },
  options: CompileOptions
): Promise<ExecutionTimeline> {
  const steps: TimelineStep[] = [];
  let currentTimeMs = 0;
  let stepCounter = 1;

  // Extract block params
  const {
    pattern = "circuit", // Default to circuit if not specified
    mode, // "reps" for continuous rep-based flow (like lab), "time" or undefined for traditional
    setsPerExercise = 1,
    workSec = 30,
    restSec = 30,
    roundRestSec = 0, // Rest between circuit rounds (default 0 for non-circuit workouts)
    transitionSec = 0,
    awaitReadyBeforeStart = false,
    targetReps, // Rep-based exercises (e.g., "12" or "10-12")
    postCardio,
  } = block.params as any;

  // Debug logging to verify pattern is being received correctly
  console.log('🔧 Compiler received block:', {
    name: block.name,
    type: block.type,
    pattern,
    params: block.params
  });

  // Optional: Add intro instruction (marked as pre-workout - doesn't count toward timer)
  if (options.includeIntro) {
    steps.push({
      step: stepCounter++,
      type: "instruction",
      text: `Welcome to ${options.workoutName}. Get ready to begin.`,
      atMs: currentTimeMs,
      endMs: currentTimeMs + 10000, // 10 second intro
      durationSec: 10,
      preWorkout: true, // This step happens before workout timer starts
    });
    currentTimeMs += 10000;
  }

  // Optional: Add await_ready before block starts
  if (awaitReadyBeforeStart) {
    steps.push({
      step: stepCounter++,
      type: "await_ready",
      label: "Ready to start?",
      coachPrompt: "Take a moment. When you're ready, say 'Ready'.",
      atMs: currentTimeMs,
      endMs: currentTimeMs, // Zero duration - waits indefinitely
      nextStepId: `step-${stepCounter}`,
    });
    // Note: currentTimeMs doesn't advance - await_ready re-anchors timeline
  }

  // Main block compilation
  if (block.type === "custom_sequence") {
    // STRAIGHT SETS: Complete all sets of one exercise before moving to next
    if (pattern === "straight_sets") {
      for (let exIndex = 0; exIndex < block.exercises.length; exIndex++) {
        const exercise = block.exercises[exIndex];
        const exerciseWorkSec = exercise.workSec || workSec;
        const exerciseRestSec = exercise.restSec || restSec;
        
        // Check exercise-level targetReps first, fall back to block-level
        const exerciseTargetReps = exercise.targetReps || targetReps;
        // Determine if this exercise is rep-based (has targetReps but no explicit workSec override)
        const isRepBased = exerciseTargetReps && !exercise.workSec && !block.params.workSec;

        for (let set = 1; set <= setsPerExercise; set++) {
          // Work step
          const cues = exercise.coachingBulletPoints
            ? exercise.coachingBulletPoints
                .split(/[\n;]/)
                .map((c) => c.trim().replace(/^[•\-\*]\s*/, ""))
                .filter((c) => c.length > 0)
            : [];

          steps.push({
            step: stepCounter++,
            type: "work",
            exercise: {
              id: exercise.exerciseId,
              name: exercise.exerciseName,
              cues,
              equipment: [
                exercise.equipmentPrimary,
                ...(exercise.equipmentSecondary || []),
              ].filter(Boolean) as string[],
              muscleGroup: exercise.primaryMuscleGroup || "Unknown",
              videoUrl: exercise.videoUrl || undefined,
              imageUrl: exercise.imageUrl || undefined,
            },
            atMs: currentTimeMs,
            endMs: currentTimeMs + exerciseWorkSec * 1000,
            durationSec: exerciseWorkSec,
            set,
            round: exIndex + 1,
          });
          currentTimeMs += exerciseWorkSec * 1000;

          // Rest between sets (but not after the last set of the last exercise)
          const isLastSet = set === setsPerExercise;
          const isLastExercise = exIndex === block.exercises.length - 1;
          
          // For continuous rep-based blocks (mode: "reps"), use timed rest periods
          // (straight sets don't use canonical round transitions - just normal rest)
          if (mode === "reps" && (!isLastSet || !isLastExercise)) {
            steps.push({
              step: stepCounter++,
              type: "rest",
              text: isLastSet ? "Transition to next exercise" : `Rest before set ${set + 1}`,
              atMs: currentTimeMs,
              endMs: currentTimeMs + exerciseRestSec * 1000,
              durationSec: exerciseRestSec,
            });
            currentTimeMs += exerciseRestSec * 1000;
          }
          // For legacy rep-based exercises (targetReps without mode: "reps"), await_ready REPLACES the rest period
          else if (isRepBased && mode !== "reps" && (!isLastSet || !isLastExercise)) {
            steps.push({
              step: stepCounter++,
              type: "await_ready",
              label: `Finished ${exerciseTargetReps} reps?`,
              coachPrompt: `Great work! How many reps did you get? You can say the number, or just say 'Ready' when you're rested.`,
              atMs: currentTimeMs,
              endMs: currentTimeMs, // Zero duration - waits indefinitely (user rests during this)
              nextStepId: `step-${stepCounter}`,
            });
            // Note: currentTimeMs doesn't advance - await_ready re-anchors timeline
            // The pause serves as the rest period - no separate rest step needed
          }
          // For time-based exercises, use normal rest periods
          else if (!isRepBased && (!isLastSet || !isLastExercise)) {
            steps.push({
              step: stepCounter++,
              type: "rest",
              text: isLastSet ? "Transition to next exercise" : `Rest before set ${set + 1}`,
              atMs: currentTimeMs,
              endMs: currentTimeMs + exerciseRestSec * 1000,
              durationSec: exerciseRestSec,
            });
            currentTimeMs += exerciseRestSec * 1000;
          }
        }
      }
    } 
    // CIRCUIT/SUPERSET: Do all exercises once, then repeat (rounds)
    else {
      for (let set = 1; set <= setsPerExercise; set++) {
        for (let exIndex = 0; exIndex < block.exercises.length; exIndex++) {
          const exercise = block.exercises[exIndex];
          const exerciseWorkSec = exercise.workSec || workSec;
          const exerciseRestSec = exercise.restSec || restSec;
          
          // Check exercise-level targetReps first, fall back to block-level
          const exerciseTargetReps = exercise.targetReps || targetReps;
          // Determine if this exercise is rep-based (has targetReps but no explicit workSec override)
          const isRepBased = exerciseTargetReps && !exercise.workSec && !block.params.workSec;

          // Calculate round number (which exercise in the sequence)
          const round = exIndex + 1;

          // Work step
          const cues = exercise.coachingBulletPoints
            ? exercise.coachingBulletPoints
                .split(/[\n;]/)
                .map((c) => c.trim().replace(/^[•\-\*]\s*/, ""))
                .filter((c) => c.length > 0)
            : [];

          steps.push({
            step: stepCounter++,
            type: "work",
            exercise: {
              id: exercise.exerciseId,
              name: exercise.exerciseName,
              cues,
              equipment: [
                exercise.equipmentPrimary,
                ...(exercise.equipmentSecondary || []),
              ].filter(Boolean) as string[],
              muscleGroup: exercise.primaryMuscleGroup || "Unknown",
              videoUrl: exercise.videoUrl || undefined,
              imageUrl: exercise.imageUrl || undefined,
            },
            atMs: currentTimeMs,
            endMs: currentTimeMs + exerciseWorkSec * 1000,
            durationSec: exerciseWorkSec,
            set,
            round,
          });
          currentTimeMs += exerciseWorkSec * 1000;

          // Rest step logic
          const isLastExercise = exIndex === block.exercises.length - 1;
          const isLastSet = set === setsPerExercise;
          
          // Skip rest entirely after last exercise of last set (workout over)
          if (isLastExercise && isLastSet) {
            // No rest - workout complete
          }
          // For continuous rep-based blocks (mode: "reps"), use canonical round transitions
          // This matches the lab flow: continuous rounds with beep→voice→countdown→GO
          else if (mode === "reps" && isLastExercise && !isLastSet) {
            // Canonical between-rounds timing for rep-round workouts:
            // T0: Work ends (end beep 600ms triggered by client)
            // T0+700ms: "Round rest" voice cue (after beep clears)
            // T0+3000ms: First countdown pip (220ms)
            // T0+4000ms: Second countdown pip (220ms) 
            // T0+5000ms: GO beep (600ms long beep)
            // T0+5600ms: Next work starts (after GO beep clears)
            
            // Add a short round_rest step for the voice cue
            steps.push({
              step: stepCounter++,
              type: "round_rest",
              label: "Round Complete",
              durationSec: 0.1, // Minimal duration, just a marker for the event
              atMs: currentTimeMs + ROUND_END_TO_SPEECH_MS,
              endMs: currentTimeMs + ROUND_END_TO_SPEECH_MS + 100,
            });
            
            // Add countdown steps (3-2-1, short pips 220ms each)
            for (let i = 0; i < 2; i++) {
              steps.push({
                step: stepCounter++,
                type: "countdown",
                durationSec: 0.22, // Short pip duration
                atMs: currentTimeMs + ROUND_END_TO_COUNTDOWN_MS + (i * COUNTDOWN_INTERVAL_MS),
                endMs: currentTimeMs + ROUND_END_TO_COUNTDOWN_MS + (i * COUNTDOWN_INTERVAL_MS) + 220,
              });
            }
            
            // GO beep (long beep 600ms at T0+5000ms)
            steps.push({
              step: stepCounter++,
              type: "countdown",
              label: "GO",
              durationSec: 0.6, // Long GO beep
              atMs: currentTimeMs + GO_BEEP_OFFSET_MS,
              endMs: currentTimeMs + GO_BEEP_OFFSET_MS + 600,
            });
            
            // Advance time to work start (after GO beep completes)
            currentTimeMs += WORK_START_OFFSET_MS;
          }
          // For legacy rep-based exercises (targetReps without mode: "reps"), await_ready REPLACES rest periods
          else if (isRepBased && mode !== "reps") {
            steps.push({
              step: stepCounter++,
              type: "await_ready",
              label: `Finished ${exerciseTargetReps} reps?`,
              coachPrompt: `Great work! How many reps did you get? You can say the number, or just say 'Ready' when you're rested.`,
              atMs: currentTimeMs,
              endMs: currentTimeMs, // Zero duration - waits indefinitely (user rests during this)
              nextStepId: `step-${stepCounter}`,
            });
            // Note: currentTimeMs doesn't advance - await_ready re-anchors timeline
            // The pause serves as the rest period - no separate rest step needed
          }
          // For time-based exercises, use normal rest periods
          // Add round rest after last exercise of a round (circuit training)
          else if (isLastExercise && !isLastSet) {
            // Canonical between-rounds timing for rep-round workouts:
            // T0: Work ends (end beep 600ms triggered by client)
            // T0+700ms: "Round rest" voice cue (after beep clears)
            // T0+3000ms: First countdown pip (220ms)
            // T0+4000ms: Second countdown pip (220ms) 
            // T0+5000ms: GO beep (600ms long beep)
            // T0+5600ms: Next work starts (after GO beep clears)
            
            // Add a short round_rest step for the voice cue
            steps.push({
              step: stepCounter++,
              type: "round_rest",
              label: "Round Complete",
              durationSec: 0.1, // Minimal duration, just a marker for the event
              atMs: currentTimeMs + ROUND_END_TO_SPEECH_MS,
              endMs: currentTimeMs + ROUND_END_TO_SPEECH_MS + 100,
            });
            
            // Add countdown steps (3-2-1, short pips 220ms each)
            for (let i = 0; i < 2; i++) {
              steps.push({
                step: stepCounter++,
                type: "countdown",
                durationSec: 0.22, // Short pip duration
                atMs: currentTimeMs + ROUND_END_TO_COUNTDOWN_MS + (i * COUNTDOWN_INTERVAL_MS),
                endMs: currentTimeMs + ROUND_END_TO_COUNTDOWN_MS + (i * COUNTDOWN_INTERVAL_MS) + 220,
              });
            }
            
            // GO beep (long beep 600ms at T0+5000ms)
            steps.push({
              step: stepCounter++,
              type: "countdown",
              label: "GO",
              durationSec: 0.6, // Long GO beep
              atMs: currentTimeMs + GO_BEEP_OFFSET_MS,
              endMs: currentTimeMs + GO_BEEP_OFFSET_MS + 600,
            });
            
            // Advance time to work start (after GO beep completes)
            currentTimeMs += WORK_START_OFFSET_MS;
          }
          // Add normal exercise rest between exercises within a round
          else {
            steps.push({
              step: stepCounter++,
              type: "rest",
              durationSec: exerciseRestSec,
              atMs: currentTimeMs,
              endMs: currentTimeMs + exerciseRestSec * 1000,
            });
            currentTimeMs += exerciseRestSec * 1000;
          }
        }
      }
    }

    // Optional: Transition step before post-cardio
    if (transitionSec && postCardio) {
      steps.push({
        step: stepCounter++,
        type: "transition",
        label: `Transition to ${postCardio.exercise}`,
        durationSec: transitionSec,
        atMs: currentTimeMs,
        endMs: currentTimeMs + transitionSec * 1000,
      });
      currentTimeMs += transitionSec * 1000;
    }

    // Optional: Post-cardio finisher
    if (postCardio) {
      steps.push({
        step: stepCounter++,
        type: "work",
        exercise: {
          id: 0, // Special marker for inline exercise
          name: postCardio.exercise,
          cues: ["Maintain steady pace", "Control your breathing"],
          equipment: [postCardio.exercise],
          muscleGroup: "Cardio",
        },
        atMs: currentTimeMs,
        endMs: currentTimeMs + postCardio.durationSec * 1000,
        durationSec: postCardio.durationSec,
        set: 1,
        round: 1,
        label: "Cardio Finisher",
      });
      currentTimeMs += postCardio.durationSec * 1000;
    }
  } else if (block.type === "transition") {
    // Simple transition block
    const duration = (block.params as any).durationSec || 60;
    steps.push({
      step: stepCounter++,
      type: "transition",
      label: block.name,
      text: block.description || undefined,
      durationSec: duration,
      atMs: currentTimeMs,
      endMs: currentTimeMs + duration * 1000,
    });
    currentTimeMs += duration * 1000;
  }
  // Add more block types here (amrap_loop, emom_window, etc.) as needed

  // Calculate total duration and pre-workout duration
  const totalDurationSec = Math.ceil(currentTimeMs / 1000);
  const preWorkoutDurationMs = steps
    .filter(step => step.preWorkout)
    .reduce((sum, step) => sum + (step.endMs - step.atMs), 0);

  return {
    workoutHeader: {
      name: options.workoutName,
      totalDurationSec,
      structure: options.workoutStructure || block.type,
      preWorkoutDurationMs,
    },
    executionTimeline: steps,
    sync: {
      workoutStartEpochMs: Date.now(),
      resyncEveryMs: 15000, // Resync every 15 seconds
      allowedDriftMs: 250, // ±250ms tolerance
    },
  };
}

/**
 * Compile multiple blocks into a single workout timeline
 */
export async function compileWorkoutTimeline(
  blocks: Array<Block & { exercises: BlockExercise[] }>,
  workoutName: string
): Promise<ExecutionTimeline> {
  const allSteps: TimelineStep[] = [];
  let currentTimeMs = 0;
  let stepCounter = 1;

  // Initial await_ready - pause before starting (doesn't count toward timer)
  allSteps.push({
    step: stepCounter++,
    type: "await_ready",
    label: "Get organized and connect with your coach",
    coachPrompt: `Welcome to ${workoutName}! Take a moment to get organized. When you're ready to begin, say 'Ready' or 'Go'.`,
    atMs: currentTimeMs,
    endMs: currentTimeMs,
    nextStepId: `step-${stepCounter}`,
    preWorkout: true, // This step happens before workout timer starts
  });
  // Note: currentTimeMs doesn't advance - await_ready re-anchors timeline

  // Intro instruction (marked as pre-workout - doesn't count toward timer)
  allSteps.push({
    step: stepCounter++,
    type: "instruction",
    text: `Welcome to ${workoutName}. Get ready to begin.`,
    atMs: currentTimeMs,
    endMs: currentTimeMs + 10000,
    durationSec: 10,
    preWorkout: true,
  });
  currentTimeMs += 10000;

  // Compile each block
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const isLastBlock = i === blocks.length - 1;
    
    // Compile block to timeline
    const blockTimeline = await compileBlockToTimeline(block, {
      workoutName: block.name,
      workoutStructure: block.type,
      includeIntro: false, // No intro for individual blocks
    });

    // Merge steps, adjusting timestamps
    for (const step of blockTimeline.executionTimeline) {
      allSteps.push({
        ...step,
        step: stepCounter++,
        atMs: currentTimeMs + step.atMs,
        endMs: currentTimeMs + step.endMs,
      });
    }

    currentTimeMs += blockTimeline.workoutHeader.totalDurationSec * 1000;

    // Insert await_ready between blocks (but not after the last block)
    if (!isLastBlock) {
      const nextBlock = blocks[i + 1];
      allSteps.push({
        step: stepCounter++,
        type: "await_ready",
        label: `Ready for ${nextBlock.name}?`,
        coachPrompt: `Great work on ${block.name}! Take a moment to rest. When you're ready for ${nextBlock.name}, say 'Ready' or 'Go'.`,
        atMs: currentTimeMs,
        endMs: currentTimeMs, // Zero duration - waits indefinitely
        nextStepId: `step-${stepCounter}`,
      });
      // Note: currentTimeMs doesn't advance - await_ready re-anchors timeline
    }
  }

  // Calculate total duration and pre-workout duration
  const totalDurationSec = Math.ceil(currentTimeMs / 1000);
  const preWorkoutDurationMs = allSteps
    .filter(step => step.preWorkout)
    .reduce((sum, step) => sum + (step.endMs - step.atMs), 0);

  return {
    workoutHeader: {
      name: workoutName,
      totalDurationSec,
      structure: "multi-block",
      preWorkoutDurationMs,
    },
    executionTimeline: allSteps,
    sync: {
      workoutStartEpochMs: Date.now(),
      resyncEveryMs: 15000,
      allowedDriftMs: 250,
    },
  };
}

/**
 * Validate a compiled timeline
 * Checks for gaps, overlaps, and invalid sequences
 */
export function validateTimeline(timeline: ExecutionTimeline): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const steps = timeline.executionTimeline;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const nextStep = steps[i + 1];

    // Check step numbering
    if (step.step !== i + 1) {
      errors.push(`Step ${i + 1}: incorrect step number (${step.step})`);
    }

    // Check timestamps
    if (step.atMs < 0) {
      errors.push(`Step ${step.step}: negative start time`);
    }

    if (step.endMs <= step.atMs && step.type !== "await_ready") {
      errors.push(`Step ${step.step}: end time before start time`);
    }

    // Check for gaps between steps (except await_ready)
    if (nextStep && step.type !== "await_ready" && step.endMs !== nextStep.atMs) {
      errors.push(
        `Gap between step ${step.step} and ${nextStep.step}: ${step.endMs} → ${nextStep.atMs}`
      );
    }

    // Check required fields for work steps
    if (step.type === "work" && !step.exercise) {
      errors.push(`Step ${step.step}: work step missing exercise`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
