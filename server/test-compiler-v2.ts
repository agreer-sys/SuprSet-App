/**
 * Quick test for Compiler v2 - validates core functionality
 */

import { compileBlockToTimeline } from "./timeline-compiler";
import type { Block, BlockExercise } from "@shared/schema";

// Test 1: Superset with rep-round mode
async function testSupersetRepRound() {
  console.log("\n🧪 Test 1: Superset Rep-Round");
  
  const block: Block & { exercises: BlockExercise[] } = {
    id: 1,
    workoutId: null,
    name: "Test Superset",
    description: "Test",
    type: "custom_sequence",
    orderIndex: 0,
    params: {
      type: "custom_sequence",
      pattern: "superset",
      mode: "reps",
      setsPerExercise: 3,
      workSec: 180, // 3 min total round time
      restSec: 30,
      roundRestSec: 0,
      transitionSec: 0,
    },
    category: null,
    difficulty: 3,
    estimatedDurationSec: null,
    equipmentNeeded: [],
    muscleGroups: [],
    createdBy: null,
    isTemplate: false,
    isPublic: false,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    exercises: [
      {
        id: 1,
        blockId: 1,
        exerciseId: 123,
        orderIndex: 0,
        overrides: null,
        workSec: null,
        restSec: null,
        targetReps: "12",
        notes: null,
        exerciseName: "Bench Press",
        primaryMuscleGroup: "Chest",
        movementPattern: null,
        equipmentPrimary: "Barbell",
        equipmentSecondary: [],
        coachingBulletPoints: "Keep core tight\nControl the descent",
        videoUrl: null,
        imageUrl: null,
      },
      {
        id: 2,
        blockId: 1,
        exerciseId: 456,
        orderIndex: 1,
        overrides: null,
        workSec: null,
        restSec: null,
        targetReps: "12",
        notes: null,
        exerciseName: "Barbell Row",
        primaryMuscleGroup: "Back",
        movementPattern: null,
        equipmentPrimary: "Barbell",
        equipmentSecondary: [],
        coachingBulletPoints: "Pull with elbows\nSqueeze shoulder blades",
        videoUrl: null,
        imageUrl: null,
      },
    ],
  };

  const timeline = await compileBlockToTimeline(block, {
    workoutName: "Test Workout",
    includeIntro: false,
  });

  console.log("✅ Timeline compiled successfully");
  console.log(`   Total steps: ${timeline.executionTimeline.length}`);
  console.log(`   Duration: ${timeline.workoutHeader.totalDurationSec}s`);
  console.log(`   Structure: ${timeline.workoutHeader.structure}`);
  
  // Validate canonical structure
  const workSteps = timeline.executionTimeline.filter(s => s.type === "work");
  console.log(`   Work steps: ${workSteps.length}`);
  
  if (workSteps[0].exercises && workSteps[0].exercises.length === 2) {
    console.log("✅ Canonical structure: Single work step with exercises array");
  } else {
    console.error("❌ Expected single work step with exercises array");
  }

  return timeline;
}

// Test 2: Straight sets
async function testStraightSets() {
  console.log("\n🧪 Test 2: Straight Sets");
  
  const block: Block & { exercises: BlockExercise[] } = {
    id: 2,
    workoutId: null,
    name: "Test Straight Sets",
    description: "Test",
    type: "custom_sequence",
    orderIndex: 0,
    params: {
      type: "custom_sequence",
      pattern: "straight_sets",
      mode: "time",
      setsPerExercise: 3,
      workSec: 45,
      restSec: 60,
      roundRestSec: 0,
      transitionSec: 0,
    },
    category: null,
    difficulty: 3,
    estimatedDurationSec: null,
    equipmentNeeded: [],
    muscleGroups: [],
    createdBy: null,
    isTemplate: false,
    isPublic: false,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    exercises: [
      {
        id: 3,
        blockId: 2,
        exerciseId: 789,
        orderIndex: 0,
        overrides: null,
        workSec: null,
        restSec: null,
        targetReps: null,
        notes: null,
        exerciseName: "Push-ups",
        primaryMuscleGroup: "Chest",
        movementPattern: null,
        equipmentPrimary: "Bodyweight",
        equipmentSecondary: [],
        coachingBulletPoints: "Full range of motion",
        videoUrl: null,
        imageUrl: null,
      },
    ],
  };

  const timeline = await compileBlockToTimeline(block, {
    workoutName: "Test Workout",
    includeIntro: false,
  });

  console.log("✅ Timeline compiled successfully");
  console.log(`   Total steps: ${timeline.executionTimeline.length}`);
  console.log(`   Duration: ${timeline.workoutHeader.totalDurationSec}s`);
  
  return timeline;
}

// Run tests
async function runTests() {
  console.log("🚀 Testing Compiler v2\n");
  
  try {
    await testSupersetRepRound();
    await testStraightSets();
    
    console.log("\n✅ All tests passed!");
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

if (require.main === module) {
  runTests();
}
