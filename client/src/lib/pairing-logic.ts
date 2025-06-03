import type { Exercise } from "@shared/schema";

export interface PairingRecommendation {
  exercise: Exercise;
  compatibilityScore: number;
  reasoning: string[];
}

export function calculateCompatibilityScore(exerciseA: Exercise, exerciseB: Exercise): number {
  let score = 0;
  
  // Opposing muscle groups (highest priority)
  if (isOpposingMovementPattern(exerciseA.movementPattern, exerciseB.movementPattern)) {
    score += 40;
  }
  
  // Same equipment (efficiency)
  if (exerciseA.equipment === exerciseB.equipment) {
    score += 25;
  }
  
  // Different primary muscle groups (recovery)
  if (!hasMuscleOverlap(exerciseA.primaryMuscles, exerciseB.primaryMuscles)) {
    score += 20;
  }
  
  // Difficulty balance
  const difficultyDiff = Math.abs(exerciseA.difficulty - exerciseB.difficulty);
  if (difficultyDiff <= 1) {
    score += 10;
  }
  
  // Compound + isolation pairing
  if (isCompoundIsolationPair(exerciseA, exerciseB)) {
    score += 5;
  }
  
  return Math.min(score, 100);
}

export function generatePairingReasoning(exerciseA: Exercise, exerciseB: Exercise): string[] {
  const reasoning = [];
  
  if (isOpposingMovementPattern(exerciseA.movementPattern, exerciseB.movementPattern)) {
    reasoning.push("Opposing movement patterns for balanced training");
  }
  
  if (exerciseA.equipment === exerciseB.equipment) {
    reasoning.push("Same equipment for efficient transitions");
  }
  
  if (!hasMuscleOverlap(exerciseA.primaryMuscles, exerciseB.primaryMuscles)) {
    reasoning.push("Different muscle groups allow for active recovery");
  }
  
  if (isCompoundIsolationPair(exerciseA, exerciseB)) {
    reasoning.push("Compound and isolation exercise pairing");
  }
  
  const difficultyDiff = Math.abs(exerciseA.difficulty - exerciseB.difficulty);
  if (difficultyDiff <= 1) {
    reasoning.push("Similar difficulty levels for consistent intensity");
  }
  
  return reasoning;
}

function isOpposingMovementPattern(patternA: string, patternB: string): boolean {
  const opposingPairs = [
    ["horizontal_push", "horizontal_pull"],
    ["vertical_push", "vertical_pull"],
    ["squat", "hinge"],
  ];
  
  return opposingPairs.some(pair => 
    (pair[0] === patternA && pair[1] === patternB) ||
    (pair[1] === patternA && pair[0] === patternB)
  );
}

function hasMuscleOverlap(musclesA: string[], musclesB: string[]): boolean {
  return musclesA.some(muscle => musclesB.includes(muscle));
}

function isCompoundIsolationPair(exerciseA: Exercise, exerciseB: Exercise): boolean {
  const compoundCategories = ["compound"];
  const isACompound = compoundCategories.includes(exerciseA.category) || exerciseA.primaryMuscles.length > 2;
  const isBCompound = compoundCategories.includes(exerciseB.category) || exerciseB.primaryMuscles.length > 2;
  
  return isACompound !== isBCompound;
}
