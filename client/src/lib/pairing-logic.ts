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
  
  // Enhanced Equipment Zone Efficiency (35 pts total)
  const equipmentScore = calculateEquipmentZoneEfficiency(exerciseA, exerciseB);
  score += equipmentScore;
  
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
  
  // Enhanced equipment zone reasoning
  const equipmentReasoning = getEquipmentZoneReasoning(exerciseA, exerciseB);
  if (equipmentReasoning) {
    reasoning.push(equipmentReasoning);
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

// Equipment Zone Efficiency System
function getEquipmentZone(equipment: string): string {
  const equipment_lower = equipment.toLowerCase();
  
  // Free Weight Zone
  if (equipment_lower.includes('barbell') || equipment_lower.includes('dumbbell') || 
      equipment_lower.includes('weight plate') || equipment_lower.includes('kettlebell') ||
      equipment_lower.includes('ez-bar') || equipment_lower.includes('ez bar')) {
    return 'free_weight';
  }
  
  // Cable/Machine Zone
  if (equipment_lower.includes('cable') || equipment_lower.includes('machine') ||
      equipment_lower.includes('smith') || equipment_lower.includes('pulldown') ||
      equipment_lower.includes('press machine') || equipment_lower.includes('curl machine')) {
    return 'cable_machine';
  }
  
  // Bodyweight Zone
  if (equipment_lower.includes('bodyweight') || equipment_lower.includes('pull-up') ||
      equipment_lower.includes('dip bar') || equipment_lower.includes('mat') ||
      equipment_lower === 'bodyweight' || equipment_lower.includes('wall')) {
    return 'bodyweight';
  }
  
  // Functional Zone
  if (equipment_lower.includes('resistance band') || equipment_lower.includes('medicine ball') ||
      equipment_lower.includes('plyo') || equipment_lower.includes('trx') ||
      equipment_lower.includes('suspension') || equipment_lower.includes('sled')) {
    return 'functional';
  }
  
  // Default to functional for unknown equipment
  return 'functional';
}

function isPortableEquipment(equipment: string): boolean {
  const equipment_lower = equipment.toLowerCase();
  return equipment_lower.includes('dumbbell') || 
         equipment_lower.includes('resistance band') ||
         equipment_lower.includes('bodyweight') ||
         equipment_lower.includes('kettlebell') ||
         equipment_lower.includes('medicine ball');
}

function calculateEquipmentZoneEfficiency(exerciseA: Exercise, exerciseB: Exercise): number {
  const zoneA = getEquipmentZone(exerciseA.equipment);
  const zoneB = getEquipmentZone(exerciseB.equipment);
  
  // Same zone = maximum efficiency (25 pts)
  if (zoneA === zoneB) {
    let score = 25;
    
    // Equipment synergy bonus (up to 10 pts)
    if (exerciseA.equipment === exerciseB.equipment) {
      score += 5; // Exact same equipment
    }
    
    // Portable equipment bonus
    if (isPortableEquipment(exerciseA.equipment) || isPortableEquipment(exerciseB.equipment)) {
      score += 5; // Can move between zones
    }
    
    return Math.min(score, 35);
  }
  
  // Adjacent zones (15 pts)
  const adjacentPairs = [
    ['free_weight', 'cable_machine'],
    ['free_weight', 'bodyweight'],
    ['cable_machine', 'functional'],
    ['bodyweight', 'functional']
  ];
  
  const isAdjacent = adjacentPairs.some(pair => 
    (pair[0] === zoneA && pair[1] === zoneB) ||
    (pair[1] === zoneA && pair[0] === zoneB)
  );
  
  if (isAdjacent) {
    let score = 15;
    
    // Portable equipment reduces transition penalty
    if (isPortableEquipment(exerciseA.equipment) || isPortableEquipment(exerciseB.equipment)) {
      score += 5;
    }
    
    return score;
  }
  
  // Cross-gym zones (5 pts)
  return 5;
}

function getEquipmentZoneReasoning(exerciseA: Exercise, exerciseB: Exercise): string | null {
  const zoneA = getEquipmentZone(exerciseA.equipment);
  const zoneB = getEquipmentZone(exerciseB.equipment);
  
  if (zoneA === zoneB) {
    if (exerciseA.equipment === exerciseB.equipment) {
      return "Same equipment for seamless transitions";
    }
    return `Same zone (${zoneA.replace('_', ' ')}) for efficient setup`;
  }
  
  const adjacentPairs = [
    ['free_weight', 'cable_machine'],
    ['free_weight', 'bodyweight'],
    ['cable_machine', 'functional'],
    ['bodyweight', 'functional']
  ];
  
  const isAdjacent = adjacentPairs.some(pair => 
    (pair[0] === zoneA && pair[1] === zoneB) ||
    (pair[1] === zoneA && pair[0] === zoneB)
  );
  
  if (isAdjacent) {
    return `Adjacent zones allow quick transitions`;
  }
  
  return "Different zones require longer transitions";
}
