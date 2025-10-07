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
 */

import type { Block, BlockExercise } from "@shared/schema";

// Step types supported by the coach
export type StepType = 
  | "instruction" 
  | "work" 
  | "rest" 
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
    setsPerExercise = 1,
    workSec = 30,
    restSec = 30,
    roundRestSec = 0, // Rest between circuit rounds (default 0 for non-circuit workouts)
    transitionSec = 0,
    awaitReadyBeforeStart = false,
    targetReps, // Rep-based exercises (e.g., "12" or "10-12")
    postCardio,
  } = block.params as any;

  // Determine if this is a rep-based block (has targetReps but no explicit workSec override)
  const isRepBased = targetReps && !block.params.workSec;

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
      endMs: currentTimeMs + 5000, // 5 second intro
      durationSec: 5,
      preWorkout: true, // This step happens before workout timer starts
    });
    currentTimeMs += 5000;
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

          // For rep-based exercises, add await_ready after work step
          if (isRepBased) {
            steps.push({
              step: stepCounter++,
              type: "await_ready",
              label: `Finished ${targetReps} reps?`,
              coachPrompt: `How many reps did you get? You can say the number, or just say 'Ready' to continue.`,
              atMs: currentTimeMs,
              endMs: currentTimeMs, // Zero duration - waits indefinitely
              nextStepId: `step-${stepCounter}`,
            });
            // Note: currentTimeMs doesn't advance - await_ready re-anchors timeline
          }

          // Rest between sets (but not after the last set of the last exercise)
          const isLastSet = set === setsPerExercise;
          const isLastExercise = exIndex === block.exercises.length - 1;
          
          if (!isLastSet || !isLastExercise) {
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

          // For rep-based exercises, add await_ready after work step
          if (isRepBased) {
            steps.push({
              step: stepCounter++,
              type: "await_ready",
              label: `Finished ${targetReps} reps?`,
              coachPrompt: `How many reps did you get? You can say the number, or just say 'Ready' to continue.`,
              atMs: currentTimeMs,
              endMs: currentTimeMs, // Zero duration - waits indefinitely
              nextStepId: `step-${stepCounter}`,
            });
            // Note: currentTimeMs doesn't advance - await_ready re-anchors timeline
          }

          // Rest step logic
          const isLastExercise = exIndex === block.exercises.length - 1;
          const isLastSet = set === setsPerExercise;
          
          // Skip rest entirely after last exercise of last set (workout over)
          if (isLastExercise && isLastSet) {
            // No rest - workout complete
          }
          // Add round rest after last exercise of a round (circuit training)
          else if (isLastExercise && !isLastSet && roundRestSec > 0) {
            steps.push({
              step: stepCounter++,
              type: "rest",
              label: "Round Complete - Rest",
              durationSec: roundRestSec,
              atMs: currentTimeMs,
              endMs: currentTimeMs + roundRestSec * 1000,
            });
            currentTimeMs += roundRestSec * 1000;
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

  // Intro instruction (marked as pre-workout - doesn't count toward timer)
  allSteps.push({
    step: stepCounter++,
    type: "instruction",
    text: `Welcome to ${workoutName}. Get ready to begin.`,
    atMs: currentTimeMs,
    endMs: currentTimeMs + 5000,
    durationSec: 5,
    preWorkout: true,
  });
  currentTimeMs += 5000;

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
