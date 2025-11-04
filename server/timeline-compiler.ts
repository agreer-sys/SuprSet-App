/**
 * Timeline Compiler v2 - Canonical Architecture
 * 
 * Transforms flexible Block-based workouts into flat ExecutionTimelines
 * with absolute timestamps for the AI Coach to follow.
 * 
 * Key improvements in v2:
 * - Zod discriminated union for type-safe params
 * - Simplified compilation with helper functions
 * - Better validation and error handling
 * - Maintains canonical round transitions
 */

import type { Block, BlockExercise } from "@shared/schema";
import {
  BlockParams,
  type BlockParamsT,
  type ExecutionTimeline,
  type TimelineStep,
  type ExerciseMeta,
  type CompileOptions,
} from "@shared/timeline";

// Canonical between-rounds timing (matches client/src/coach/roundBetweenScheduler.ts)
const ROUND_END_TO_SPEECH_MS = 700;    // Voice after beep clears
const ROUND_END_TO_COUNTDOWN_MS = 3000; // First countdown pip (3)
const COUNTDOWN_INTERVAL_MS = 1000;    // Between pips (3→2→1)
const GO_BEEP_OFFSET_MS = 5000;        // GO beep (long 600ms beep)
const WORK_START_OFFSET_MS = 5600;     // Work starts 600ms after GO (beep duration)

/**
 * Helper: Parse and validate block params
 */
function parseBlockParams(block: Block): BlockParamsT {
  try {
    return BlockParams.parse({ ...block.params, type: block.type });
  } catch (error) {
    console.error('Invalid block params:', error);
    throw new Error(`Block "${block.name}" has invalid parameters: ${error}`);
  }
}

/**
 * Helper: Extract exercise metadata from BlockExercise
 * Optionally includes targetReps for rep-based workouts
 */
function extractExerciseMeta(exercise: BlockExercise, includeTargetReps?: string): ExerciseMeta {
  const cues = exercise.coachingBulletPoints
    ? exercise.coachingBulletPoints
        .split(/[\n;]/)
        .map((c) => c.trim().replace(/^[•\-\*]\s*/, ""))
        .filter((c) => c.length > 0)
    : [];

  return {
    id: exercise.exerciseId,
    name: exercise.exerciseName,
    targetReps: includeTargetReps, // For rep-round workouts
    cues,
    equipment: [
      exercise.equipmentPrimary,
      ...(exercise.equipmentSecondary || []),
    ].filter(Boolean) as string[],
    muscleGroup: exercise.primaryMuscleGroup || "Unknown",
    videoUrl: exercise.videoUrl || undefined,
    imageUrl: exercise.imageUrl || undefined,
  };
}

/**
 * Helper: Apply exercise-level overrides to params
 */
function applyOverrides(
  exercise: BlockExercise,
  params: BlockParamsT
): { workSec: number; restSec: number; targetReps?: string } {
  // NEW: Check JSONB overrides field first (canonical admin)
  if (exercise.overrides) {
    return {
      workSec: exercise.overrides.workSec ?? (params.type === "custom_sequence" ? params.workSec : 30),
      restSec: exercise.overrides.restSec ?? (params.type === "custom_sequence" ? params.restSec : 30),
      targetReps: exercise.overrides.targetReps ?? (params.type === "custom_sequence" ? params.targetReps : undefined),
    };
  }
  
  // LEGACY: Fall back to individual columns (backward compatibility)
  return {
    workSec: exercise.workSec ?? (params.type === "custom_sequence" ? params.workSec : 30),
    restSec: exercise.restSec ?? (params.type === "custom_sequence" ? params.restSec : 30),
    targetReps: exercise.targetReps ?? (params.type === "custom_sequence" ? params.targetReps : undefined),
  };
}

/**
 * Helper: Add canonical round transition (beep→voice→countdown→GO)
 */
function addRoundTransition(
  steps: TimelineStep[],
  stepCounter: { value: number },
  currentTimeMs: number
): number {
  // T0: Work ends (end beep 600ms triggered by client)
  // T0+700ms: "Round rest" voice cue
  steps.push({
    step: stepCounter.value++,
    type: "round_rest",
    label: "Round Complete",
    durationSec: 0.1,
    atMs: currentTimeMs + ROUND_END_TO_SPEECH_MS,
    endMs: currentTimeMs + ROUND_END_TO_SPEECH_MS + 100,
  });

  // T0+3000ms & T0+4000ms: Countdown pips (3-2)
  for (let i = 0; i < 2; i++) {
    steps.push({
      step: stepCounter.value++,
      type: "countdown",
      durationSec: 0.22,
      atMs: currentTimeMs + ROUND_END_TO_COUNTDOWN_MS + (i * COUNTDOWN_INTERVAL_MS),
      endMs: currentTimeMs + ROUND_END_TO_COUNTDOWN_MS + (i * COUNTDOWN_INTERVAL_MS) + 220,
    });
  }

  // T0+5000ms: GO beep (600ms long beep)
  steps.push({
    step: stepCounter.value++,
    type: "countdown",
    label: "GO",
    durationSec: 0.6,
    atMs: currentTimeMs + GO_BEEP_OFFSET_MS,
    endMs: currentTimeMs + GO_BEEP_OFFSET_MS + 600,
  });

  // Return time when next work starts (T0+5600ms)
  return currentTimeMs + WORK_START_OFFSET_MS;
}

/**
 * Compile custom_sequence block (superset, straight_sets, circuit)
 */
function compileCustomSequence(
  block: Block & { exercises: BlockExercise[] },
  params: Extract<BlockParamsT, { type: "custom_sequence" }>,
  steps: TimelineStep[],
  stepCounter: { value: number },
  startTimeMs: number
): number {
  let currentTimeMs = startTimeMs;
  const { pattern, mode, setsPerExercise, workSec, restSec, roundRestSec } = params;

  // ✅ CANONICAL REP-BASED ROUNDS: Single work step with exercises array
  if (mode === "reps" && (pattern === "superset" || pattern === "circuit")) {
    const targetReps = params.targetReps; // Get target reps from block params
    const exercisesArray = block.exercises.map(ex => extractExerciseMeta(ex, targetReps));
    const numRounds = setsPerExercise;
    
    // Determine rest duration: roundRestSec for circuit rounds, restSec otherwise
    const roundRestDuration = roundRestSec > 0 ? roundRestSec : restSec;

    for (let round = 1; round <= numRounds; round++) {
      // Single work step containing all exercises
      steps.push({
        step: stepCounter.value++,
        type: "work",
        exercises: exercisesArray,
        atMs: currentTimeMs,
        endMs: currentTimeMs + workSec * 1000,
        durationSec: workSec,
        set: round,
        round,
      });

      currentTimeMs += workSec * 1000;

      // Add canonical transition + additional rest (except after last round)
      if (round < numRounds) {
        // CRITICAL FIX: Canonical transition (5.6s) is REQUIRED, then add extra rest if needed
        // Flow: Work ends → Canonical transition (5.6s) → Extra rest (if roundRestDuration > 5.6s) → Next work
        
        // Step 1: Add canonical transition (beep→voice→countdown→GO) - FIXED 5.6s
        currentTimeMs = addRoundTransition(steps, stepCounter, currentTimeMs);
        
        // Step 2: Add ADDITIONAL rest if roundRestDuration > 5.6s
        // (Canonical transition already provides 5.6s of recovery)
        const additionalRestSec = Math.max(0, roundRestDuration - (WORK_START_OFFSET_MS / 1000));
        if (additionalRestSec > 0) {
          steps.push({
            step: stepCounter.value++,
            type: "rest",
            durationSec: additionalRestSec,
            atMs: currentTimeMs,
            endMs: currentTimeMs + additionalRestSec * 1000,
          });
          currentTimeMs += additionalRestSec * 1000;
        }
      }
    }
  }
  // STRAIGHT SETS: Complete all sets of one exercise before moving to next
  else if (pattern === "straight_sets") {
    for (let exIndex = 0; exIndex < block.exercises.length; exIndex++) {
      const exercise = block.exercises[exIndex];
      const { workSec: exWorkSec, restSec: exRestSec, targetReps } = applyOverrides(exercise, params);
      const isRepBased = targetReps && !exercise.workSec && !exercise.overrides?.workSec && !params.workSec;

      for (let set = 1; set <= setsPerExercise; set++) {
        const exerciseMeta = extractExerciseMeta(exercise);

        // Work step
        steps.push({
          step: stepCounter.value++,
          type: "work",
          exercise: exerciseMeta,
          atMs: currentTimeMs,
          endMs: currentTimeMs + exWorkSec * 1000,
          durationSec: exWorkSec,
          set,
          round: exIndex + 1,
        });
        currentTimeMs += exWorkSec * 1000;

        const isLastSet = set === setsPerExercise;
        const isLastExercise = exIndex === block.exercises.length - 1;

        // Rest logic
        if (isLastSet && isLastExercise) {
          // No rest - workout complete
        } else if (mode === "reps" && (!isLastSet || !isLastExercise)) {
          // Timed rest for continuous rep-based flow
          steps.push({
            step: stepCounter.value++,
            type: "rest",
            text: isLastSet ? "Transition to next exercise" : `Rest before set ${set + 1}`,
            atMs: currentTimeMs,
            endMs: currentTimeMs + exRestSec * 1000,
            durationSec: exRestSec,
          });
          currentTimeMs += exRestSec * 1000;
        } else if (isRepBased && mode !== "reps" && (!isLastSet || !isLastExercise)) {
          // Legacy await_ready for rep-based (user-paced rest)
          steps.push({
            step: stepCounter.value++,
            type: "await_ready",
            label: `Finished ${targetReps} reps?`,
            coachPrompt: `Great work! How many reps did you get? You can say the number, or just say 'Ready' when you're rested.`,
            atMs: currentTimeMs,
            endMs: currentTimeMs,
            nextStepId: `step-${stepCounter.value}`,
          });
        } else if (!isRepBased && (!isLastSet || !isLastExercise)) {
          // Normal timed rest
          steps.push({
            step: stepCounter.value++,
            type: "rest",
            text: isLastSet ? "Transition to next exercise" : `Rest before set ${set + 1}`,
            atMs: currentTimeMs,
            endMs: currentTimeMs + exRestSec * 1000,
            durationSec: exRestSec,
          });
          currentTimeMs += exRestSec * 1000;
        }
      }
    }
  }
  // CIRCUIT/SUPERSET: Do all exercises once, then repeat (rounds)
  else {
    for (let set = 1; set <= setsPerExercise; set++) {
      for (let exIndex = 0; exIndex < block.exercises.length; exIndex++) {
        const exercise = block.exercises[exIndex];
        const { workSec: exWorkSec, restSec: exRestSec, targetReps } = applyOverrides(exercise, params);
        const isRepBased = targetReps && !exercise.workSec && !exercise.overrides?.workSec && !params.workSec;
        const exerciseMeta = extractExerciseMeta(exercise);

        // Work step
        steps.push({
          step: stepCounter.value++,
          type: "work",
          exercise: exerciseMeta,
          atMs: currentTimeMs,
          endMs: currentTimeMs + exWorkSec * 1000,
          durationSec: exWorkSec,
          set,
          round: exIndex + 1,
        });
        currentTimeMs += exWorkSec * 1000;

        const isLastExercise = exIndex === block.exercises.length - 1;
        const isLastSet = set === setsPerExercise;

        // Rest logic
        if (isLastExercise && isLastSet) {
          // No rest - workout complete
        } else if (mode === "reps" && isLastExercise && !isLastSet) {
          // Canonical round transition for rep-round workouts
          currentTimeMs = addRoundTransition(steps, stepCounter, currentTimeMs);
        } else if (isRepBased && mode !== "reps") {
          // Legacy await_ready for rep-based
          steps.push({
            step: stepCounter.value++,
            type: "await_ready",
            label: `Finished ${targetReps} reps?`,
            coachPrompt: `Great work! How many reps did you get? You can say the number, or just say 'Ready' when you're rested.`,
            atMs: currentTimeMs,
            endMs: currentTimeMs,
            nextStepId: `step-${stepCounter.value}`,
          });
        } else if (isLastExercise && !isLastSet) {
          // Round rest (between circuit rounds)
          currentTimeMs = addRoundTransition(steps, stepCounter, currentTimeMs);
        } else {
          // Normal exercise rest
          steps.push({
            step: stepCounter.value++,
            type: "rest",
            durationSec: exRestSec,
            atMs: currentTimeMs,
            endMs: currentTimeMs + exRestSec * 1000,
          });
          currentTimeMs += exRestSec * 1000;
        }
      }
    }
  }

  // Post-cardio finisher
  if (params.postCardio) {
    if (params.transitionSec) {
      steps.push({
        step: stepCounter.value++,
        type: "transition",
        label: `Transition to ${params.postCardio.exercise}`,
        durationSec: params.transitionSec,
        atMs: currentTimeMs,
        endMs: currentTimeMs + params.transitionSec * 1000,
      });
      currentTimeMs += params.transitionSec * 1000;
    }

    steps.push({
      step: stepCounter.value++,
      type: "work",
      exercise: {
        id: 0,
        name: params.postCardio.exercise,
        cues: ["Maintain steady pace", "Control your breathing"],
        equipment: [params.postCardio.exercise],
        muscleGroup: "Cardio",
      },
      atMs: currentTimeMs,
      endMs: currentTimeMs + params.postCardio.durationSec * 1000,
      durationSec: params.postCardio.durationSec,
      set: 1,
      round: 1,
      label: "Cardio Finisher",
    });
    currentTimeMs += params.postCardio.durationSec * 1000;
  }

  return currentTimeMs;
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
  let currentTimeMs = options.startAtMs || 0;
  const stepCounter = { value: 1 };

  // Parse and validate params
  const params = parseBlockParams(block);

  // Optional: Add intro instruction (pre-workout)
  if (options.includeIntro) {
    steps.push({
      step: stepCounter.value++,
      type: "instruction",
      text: `Welcome to ${options.workoutName}. Get ready to begin.`,
      atMs: currentTimeMs,
      endMs: currentTimeMs + 10000,
      durationSec: 10,
      preWorkout: true,
    });
    currentTimeMs += 10000;
  }

  // Optional: Add await_ready before block starts
  if (params.type === "custom_sequence" && params.awaitReadyBeforeStart) {
    steps.push({
      step: stepCounter.value++,
      type: "await_ready",
      label: "Ready to start?",
      coachPrompt: "Take a moment. When you're ready, say 'Ready'.",
      atMs: currentTimeMs,
      endMs: currentTimeMs,
      nextStepId: `step-${stepCounter.value}`,
    });
  }

  // Compile block by type
  if (params.type === "custom_sequence") {
    currentTimeMs = compileCustomSequence(block, params, steps, stepCounter, currentTimeMs);
  } else if (params.type === "transition") {
    steps.push({
      step: stepCounter.value++,
      type: "transition",
      label: block.name,
      text: block.description || undefined,
      durationSec: params.durationSec,
      atMs: currentTimeMs,
      endMs: currentTimeMs + params.durationSec * 1000,
    });
    currentTimeMs += params.durationSec * 1000;
  } else if (params.type === "amrap_loop") {
    // AMRAP implementation (future)
    throw new Error("AMRAP blocks not yet implemented");
  } else if (params.type === "emom_window") {
    // EMOM implementation (future)
    throw new Error("EMOM blocks not yet implemented");
  }

  // Calculate durations
  const totalDurationSec = Math.ceil(currentTimeMs / 1000);
  const preWorkoutDurationMs = steps
    .filter(step => step.preWorkout)
    .reduce((sum, step) => sum + (step.endMs - step.atMs), 0);

  return {
    workoutHeader: {
      name: options.workoutName || block.name,
      totalDurationSec,
      structure: options.workoutStructure || block.type,
      preWorkoutDurationMs,
    },
    executionTimeline: steps,
    sync: {
      workoutStartEpochMs: Date.now(),
      resyncEveryMs: 15000,
      allowedDriftMs: 250,
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
  const stepCounter = { value: 1 };

  // Initial await_ready (pre-workout)
  allSteps.push({
    step: stepCounter.value++,
    type: "await_ready",
    label: "Get organized and connect with your coach",
    coachPrompt: `Welcome to ${workoutName}! Take a moment to get organized. When you're ready to begin, say 'Ready' or 'Go'.`,
    atMs: currentTimeMs,
    endMs: currentTimeMs,
    nextStepId: `step-${stepCounter.value}`,
    preWorkout: true,
  });

  // Intro instruction (pre-workout)
  allSteps.push({
    step: stepCounter.value++,
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

    // Compile block
    const blockTimeline = await compileBlockToTimeline(block, {
      workoutName: block.name,
      workoutStructure: block.type,
      includeIntro: false,
      startAtMs: 0,
    });

    // Merge steps with adjusted timestamps
    for (const step of blockTimeline.executionTimeline) {
      allSteps.push({
        ...step,
        step: stepCounter.value++,
        atMs: currentTimeMs + step.atMs,
        endMs: currentTimeMs + step.endMs,
      });
    }

    currentTimeMs += blockTimeline.workoutHeader.totalDurationSec * 1000;

    // Insert await_ready between blocks
    if (!isLastBlock) {
      const nextBlock = blocks[i + 1];
      allSteps.push({
        step: stepCounter.value++,
        type: "await_ready",
        label: `Ready for ${nextBlock.name}?`,
        coachPrompt: `Great work on ${block.name}! Take a moment to rest. When you're ready for ${nextBlock.name}, say 'Ready' or 'Go'.`,
        atMs: currentTimeMs,
        endMs: currentTimeMs,
        nextStepId: `step-${stepCounter.value}`,
      });
    }
  }

  // Calculate durations
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

    // Check for gaps (except await_ready)
    if (nextStep && step.type !== "await_ready" && step.endMs !== nextStep.atMs) {
      errors.push(
        `Gap between step ${step.step} and ${nextStep.step}: ${step.endMs} → ${nextStep.atMs}`
      );
    }

    // Check required fields for work steps
    if (step.type === "work" && !step.exercise && !step.exercises) {
      errors.push(`Step ${step.step}: work step missing exercise data`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
