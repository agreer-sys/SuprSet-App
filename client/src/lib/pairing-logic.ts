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
  
  // Enhanced Equipment Ecosystem Efficiency (35 pts) + Exercise Quality (5 pts)
  const equipmentScore = calculateEquipmentEcosystemEfficiency(exerciseA, exerciseB);
  const qualityBonus = Math.min(getExerciseQualityScore(exerciseB.equipment, exerciseB.exerciseType || ''), 5);
  score += equipmentScore + qualityBonus;
  
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
  
  // Enhanced equipment ecosystem reasoning
  const equipmentReasoning = getEquipmentEcosystemReasoning(exerciseA, exerciseB);
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

// Equipment Ecosystem Efficiency System
function getEquipmentEcosystem(equipment: string): { type: string; canSupport: string[] } {
  const equipment_lower = equipment.toLowerCase();
  
  // Multi-Exercise Hubs (High Superset Potential)
  if (equipment_lower.includes('squat rack') || equipment_lower.includes('power rack') ||
      equipment_lower.includes('rig') || equipment_lower.includes('rack')) {
    return { type: 'rack_hub', canSupport: ['barbell', 'pullups', 'dumbbells', 'bodyweight', 'bands'] };
  }
  
  if ((equipment_lower.includes('bench') && equipment_lower.includes('barbell')) ||
      equipment_lower.includes('olympic bench')) {
    return { type: 'bench_barbell_hub', canSupport: ['barbell', 'dumbbells', 'bodyweight'] };
  }
  
  if (equipment_lower.includes('cable')) {
    return { type: 'cable_hub', canSupport: ['cable_variations', 'dumbbells', 'bodyweight', 'bands'] };
  }
  
  // Single Equipment + Portable Additions
  if (equipment_lower.includes('bench') && equipment_lower.includes('dumbbell')) {
    return { type: 'bench_dumbbell', canSupport: ['dumbbells', 'bodyweight'] };
  }
  
  if (equipment_lower.includes('dumbbell') && !equipment_lower.includes('bench')) {
    return { type: 'dumbbell_portable', canSupport: ['dumbbells', 'bodyweight', 'bands'] };
  }
  
  // Fixed Single-Exercise Equipment
  if (equipment_lower.includes('press machine') || equipment_lower.includes('leg press') ||
      equipment_lower.includes('pulldown') || equipment_lower.includes('curl machine') ||
      equipment_lower.includes('extension machine') || equipment_lower.includes('fly machine')) {
    return { type: 'fixed_machine', canSupport: ['dumbbells', 'bodyweight', 'bands'] };
  }
  
  // Bodyweight/Minimal Equipment
  if (equipment_lower.includes('bodyweight') || equipment_lower === 'bodyweight') {
    return { type: 'bodyweight', canSupport: ['bodyweight', 'bands', 'dumbbells'] };
  }
  
  // Default to portable
  return { type: 'portable', canSupport: ['bodyweight', 'bands'] };
}

function isPortableEquipment(equipment: string): boolean {
  const equipment_lower = equipment.toLowerCase();
  return equipment_lower.includes('dumbbell') || 
         equipment_lower.includes('resistance band') ||
         equipment_lower.includes('bodyweight') ||
         equipment_lower.includes('kettlebell') ||
         equipment_lower.includes('medicine ball');
}

function getExerciseQualityScore(equipment: string, exerciseType: string): number {
  const equipment_lower = equipment.toLowerCase();
  
  // Premium exercise quality (full range of motion, optimal setup)
  if (equipment_lower.includes('barbell') || equipment_lower.includes('dumbbell') ||
      equipment_lower.includes('cable')) {
    return 10; // High quality strength exercises
  }
  
  // Excellent bodyweight exercises (full range, proven effectiveness)
  if (equipment_lower.includes('bodyweight') && 
      (exerciseType?.toLowerCase().includes('push') || exerciseType?.toLowerCase().includes('pull'))) {
    return 9; // Push-ups, pull-ups are excellent
  }
  
  // Good bodyweight exercises
  if (equipment_lower.includes('bodyweight')) {
    return 8; // Other bodyweight exercises
  }
  
  // Functional equipment
  if (equipment_lower.includes('band') || equipment_lower.includes('medicine ball')) {
    return 7; // Good accessory tools
  }
  
  // Default
  return 6;
}

function calculateEquipmentEcosystemEfficiency(exerciseA: Exercise, exerciseB: Exercise): number {
  const ecosystemA = getEquipmentEcosystem(exerciseA.equipment);
  const ecosystemB = getEquipmentEcosystem(exerciseB.equipment);
  
  // Same equipment = maximum efficiency (35 pts)
  if (exerciseA.equipment === exerciseB.equipment) {
    return 35;
  }
  
  // Equipment ecosystem compatibility (30 pts)
  // Can exercise B be done with exercise A's equipment setup?
  if (ecosystemA.type === 'rack_hub') {
    // Rack can support barbell, pullups, dumbbells, bodyweight
    if (exerciseB.equipment.toLowerCase().includes('barbell') ||
        exerciseB.equipment.toLowerCase().includes('pull-up') ||
        exerciseB.equipment.toLowerCase().includes('dumbbell') ||
        exerciseB.equipment.toLowerCase().includes('bodyweight')) {
      return 30;
    }
  }
  
  if (ecosystemA.type === 'bench_barbell_hub' || ecosystemA.type === 'bench_dumbbell') {
    // Bench can support barbell, dumbbells, bodyweight on/beside bench
    if (exerciseB.equipment.toLowerCase().includes('barbell') ||
        exerciseB.equipment.toLowerCase().includes('dumbbell') ||
        exerciseB.equipment.toLowerCase().includes('bodyweight')) {
      return 30;
    }
  }
  
  if (ecosystemA.type === 'cable_hub') {
    // Cable station can support different cable exercises, dumbbells, bodyweight beside
    if (exerciseB.equipment.toLowerCase().includes('cable') ||
        exerciseB.equipment.toLowerCase().includes('dumbbell') ||
        exerciseB.equipment.toLowerCase().includes('bodyweight')) {
      return 30;
    }
  }
  
  // Fixed machine + portable addition (25 pts)
  if (ecosystemA.type === 'fixed_machine') {
    if (exerciseB.equipment.toLowerCase().includes('dumbbell') ||
        exerciseB.equipment.toLowerCase().includes('bodyweight') ||
        exerciseB.equipment.toLowerCase().includes('band')) {
      return 25;
    }
  }
  
  // Portable equipment pairing (20 pts)
  if (isPortableEquipment(exerciseA.equipment) && isPortableEquipment(exerciseB.equipment)) {
    return 20;
  }
  
  // Poor efficiency - requires multiple major equipment pieces (5 pts)
  return 5;
}

function getEquipmentEcosystemReasoning(exerciseA: Exercise, exerciseB: Exercise): string | null {
  const ecosystemA = getEquipmentEcosystem(exerciseA.equipment);
  
  if (exerciseA.equipment === exerciseB.equipment) {
    return "Same equipment for seamless transitions";
  }
  
  if (ecosystemA.type === 'rack_hub') {
    if (exerciseB.equipment.toLowerCase().includes('barbell')) {
      return "Both exercises use the same rack setup";
    }
    if (exerciseB.equipment.toLowerCase().includes('pull-up')) {
      return "Rack supports both barbell and pull-up exercises";
    }
    if (exerciseB.equipment.toLowerCase().includes('dumbbell') || 
        exerciseB.equipment.toLowerCase().includes('bodyweight')) {
      return "Can add dumbbells/bodyweight exercises in rack area";
    }
  }
  
  if (ecosystemA.type === 'bench_barbell_hub' || ecosystemA.type === 'bench_dumbbell') {
    if (exerciseB.equipment.toLowerCase().includes('dumbbell') || 
        exerciseB.equipment.toLowerCase().includes('bodyweight')) {
      return "Can maximize bench utility with dumbbells/bodyweight";
    }
  }
  
  if (ecosystemA.type === 'cable_hub') {
    if (exerciseB.equipment.toLowerCase().includes('cable')) {
      return "Both use same cable station with different attachments";
    }
    if (exerciseB.equipment.toLowerCase().includes('dumbbell') || 
        exerciseB.equipment.toLowerCase().includes('bodyweight')) {
      return "Can add dumbbells/bodyweight beside cable station";
    }
  }
  
  if (ecosystemA.type === 'fixed_machine') {
    if (exerciseB.equipment.toLowerCase().includes('dumbbell')) {
      return "Can add dumbbell exercises beside machine (better than bodyweight for strength)";
    }
    if (exerciseB.equipment.toLowerCase().includes('bodyweight')) {
      return "Can add bodyweight exercises beside machine";
    }
  }
  
  return "Poor gym etiquette - requires multiple equipment pieces";
}
