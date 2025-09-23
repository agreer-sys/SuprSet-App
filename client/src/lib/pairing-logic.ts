import type { Exercise } from "@shared/schema";

export interface PairingRecommendation {
  exercise: Exercise;
  compatibilityScore: number;
  reasoning: string[];
}

export function calculateCompatibilityScore(exerciseA: Exercise, exerciseB: Exercise): number {
  let score = 0;
  
  // Get movement patterns for both exercises
  const patternA = mapToMovementPattern(exerciseA.exerciseType || '', exerciseA.name, exerciseA.equipment);
  const patternB = mapToMovementPattern(exerciseB.exerciseType || '', exerciseB.name, exerciseB.equipment);
  
  // Opposing movement patterns (highest priority)
  if (isOpposingMovementPattern(patternA, patternB)) {
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
  
  // Get movement patterns for reasoning
  const patternA = mapToMovementPattern(exerciseA.exerciseType || '', exerciseA.name, exerciseA.equipment);
  const patternB = mapToMovementPattern(exerciseB.exerciseType || '', exerciseB.name, exerciseB.equipment);
  
  if (isOpposingMovementPattern(patternA, patternB)) {
    // Provide specific movement pattern reasoning
    if ((patternA === 'horizontal_push' && patternB === 'horizontal_pull') || (patternA === 'horizontal_pull' && patternB === 'horizontal_push')) {
      reasoning.push("Perfect push/pull balance (horizontal plane)");
    } else if ((patternA === 'vertical_push' && patternB === 'vertical_pull') || (patternA === 'vertical_pull' && patternB === 'vertical_push')) {
      reasoning.push("Perfect push/pull balance (vertical plane)");
    } else if ((patternA === 'squat' && patternB === 'hinge') || (patternA === 'hinge' && patternB === 'squat')) {
      reasoning.push("Perfect squat/hinge balance for complete lower body");
    } else if (patternA.includes('core') || patternB.includes('core')) {
      reasoning.push("Upper body + core combination for active recovery");
    } else {
      reasoning.push("Opposing movement patterns for balanced training");
    }
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

// Convert current Exercise Type to new Movement Pattern system
function mapToMovementPattern(exerciseType: string, exerciseName: string, equipment: string): string {
  const type = exerciseType?.toLowerCase() || '';
  const name = exerciseName?.toLowerCase() || '';
  const equip = equipment?.toLowerCase() || '';
  
  // Horizontal Push Pattern
  if (type === 'push' && (name.includes('bench') || name.includes('chest') || name.includes('press') && !name.includes('shoulder') && !name.includes('overhead'))) {
    return 'horizontal_push';
  }
  if (name.includes('push-up') || name.includes('pushup') || name.includes('dips') || name.includes('chest fly') || name.includes('pec deck')) {
    return 'horizontal_push';
  }
  
  // Horizontal Pull Pattern
  if (type === 'pull' && (name.includes('row') || name.includes('reverse fly') || name.includes('face pull') || name.includes('rear delt'))) {
    return 'horizontal_pull';
  }
  
  // Vertical Push Pattern
  if (type === 'push' && (name.includes('shoulder') || name.includes('overhead') || name.includes('military') || name.includes('pike'))) {
    return 'vertical_push';
  }
  if (name.includes('shoulder press') || name.includes('overhead press') || name.includes('pike push')) {
    return 'vertical_push';
  }
  
  // Vertical Pull Pattern
  if (type === 'pull' && (name.includes('pull-up') || name.includes('pullup') || name.includes('pulldown') || name.includes('lat') || name.includes('chin-up'))) {
    return 'vertical_pull';
  }
  if (name.includes('shrug') || name.includes('upright row')) {
    return 'vertical_pull';
  }
  
  // Squat Pattern
  if (type === 'squat' || name.includes('squat') || name.includes('leg press') || name.includes('wall sit')) {
    return 'squat';
  }
  
  // Hinge Pattern
  if (type === 'hinge' || name.includes('deadlift') || name.includes('hip hinge') || name.includes('hip thrust') || name.includes('glute bridge')) {
    return 'hinge';
  }
  if (name.includes('good morning') || name.includes('romanian') || name.includes('rdl')) {
    return 'hinge';
  }
  
  // Unilateral Pattern
  if (type === 'lunge' || name.includes('lunge') || name.includes('step-up') || name.includes('step up') || name.includes('single leg') || name.includes('bulgarian')) {
    return 'unilateral';
  }
  
  // Core/Stability Pattern
  if (name.includes('plank') || name.includes('dead bug') || name.includes('bird dog') || name.includes('pallof') || name.includes('anti-')) {
    return 'core';
  }
  if (name.includes('crunch') || name.includes('sit-up') || name.includes('russian twist') || name.includes('mountain climber')) {
    return 'core';
  }
  
  // Default mappings for current types
  switch (type) {
    case 'push': return 'horizontal_push';
    case 'pull': return 'horizontal_pull';
    case 'squat': return 'squat';
    case 'hinge': return 'hinge';
    case 'lunge': return 'unilateral';
    case 'accessory':
      // Smart accessory mapping based on name
      if (name.includes('curl') || name.includes('tricep') || name.includes('bicep')) {
        return name.includes('hammer') || name.includes('bicep') ? 'vertical_pull' : 'vertical_push';
      }
      if (name.includes('lateral') || name.includes('front raise')) return 'vertical_push';
      if (name.includes('calf')) return 'squat';
      return 'accessory';
    default: return 'general';
  }
}

function isOpposingMovementPattern(patternA: string, patternB: string): boolean {
  // Get movement patterns from exercise types
  const opposingPairs = [
    ["horizontal_push", "horizontal_pull"],
    ["vertical_push", "vertical_pull"],
    ["squat", "hinge"],
    ["unilateral", "core"],
    ["horizontal_push", "core"],
    ["horizontal_pull", "core"],
    ["vertical_push", "core"],
    ["vertical_pull", "core"],
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
  let score = 0;
  
  // THREE-FIELD EQUIPMENT SYSTEM SCORING
  
  // 1. PRIMARY EQUIPMENT MATCHING (35pts max)
  if (exerciseA.equipmentPrimary && exerciseB.equipmentPrimary) {
    if (exerciseA.equipmentPrimary === exerciseB.equipmentPrimary) {
      score += 35; // Perfect primary equipment match = seamless transition
    } else if (isCompatiblePrimaryEquipment(exerciseA.equipmentPrimary, exerciseB.equipmentPrimary)) {
      score += 25; // Compatible primary equipment (e.g., Dumbbells + Kettlebells)
    }
  }
  
  // 2. SECONDARY EQUIPMENT SYNERGY (25pts max)
  if (exerciseA.equipmentSecondary && exerciseB.equipmentSecondary) {
    const sharedSecondary = getSharedEquipment(exerciseA.equipmentSecondary, exerciseB.equipmentSecondary);
    if (sharedSecondary.length > 0) {
      // Shared accessories like bench, rack, attachments
      score += Math.min(25, sharedSecondary.length * 15); // 15pts per shared accessory, max 25
    }
  }
  
  // 3. EQUIPMENT TYPE COMPATIBILITY (15pts max)  
  if (exerciseA.equipmentType && exerciseB.equipmentType) {
    const sharedTypes = getSharedEquipment(exerciseA.equipmentType, exerciseB.equipmentType);
    if (sharedTypes.length > 0) {
      // Same variants like Olympic + Olympic, Hex + Hex
      score += Math.min(15, sharedTypes.length * 8); // 8pts per shared type, max 15
    }
  }
  
  // FALLBACK: Use legacy equipment field if new fields unavailable
  if (score === 0) {
    return calculateLegacyEquipmentScore(exerciseA, exerciseB);
  }
  
  return Math.min(score, 40); // Cap at 40pts total for equipment scoring
}

// Helper function to check compatible primary equipment
function isCompatiblePrimaryEquipment(equipmentA: string, equipmentB: string): boolean {
  const compatibilityGroups = [
    ['Dumbbells', 'Kettlebells'], // Both free weights, similar movement
    ['Barbell', 'EZ Barbell'], // Both barbells, similar setup
    ['Cable Tower', 'Functional Trainer'], // Both cable systems
    ['Flat Bench', 'Incline Bench', 'Decline Bench'], // All bench variants
    ['Leg Press Machine', 'Leg Extension Machine', 'Leg Curl Machine'], // Leg machine cluster
    ['Chest Press Machine', 'Incline Chest Press Machine', 'Pec Fly Machine'] // Chest machine cluster
  ];
  
  return compatibilityGroups.some(group => 
    group.includes(equipmentA) && group.includes(equipmentB)
  );
}

// Helper function to find shared equipment between arrays
function getSharedEquipment(arrayA: string[], arrayB: string[]): string[] {
  return arrayA.filter(item => arrayB.includes(item));
}

// Legacy equipment scoring for backwards compatibility
function calculateLegacyEquipmentScore(exerciseA: Exercise, exerciseB: Exercise): number {
  const ecosystemA = getEquipmentEcosystem(exerciseA.equipment);
  const ecosystemB = getEquipmentEcosystem(exerciseB.equipment);
  
  // Same equipment = maximum efficiency (35 pts)
  if (exerciseA.equipment === exerciseB.equipment) {
    return 35;
  }
  
  // Equipment ecosystem compatibility (30 pts)
  if (ecosystemA.type === 'rack_hub') {
    if (exerciseB.equipment.toLowerCase().includes('barbell') ||
        exerciseB.equipment.toLowerCase().includes('pull-up') ||
        exerciseB.equipment.toLowerCase().includes('dumbbell') ||
        exerciseB.equipment.toLowerCase().includes('bodyweight')) {
      return 30;
    }
  }
  
  if (ecosystemA.type === 'bench_barbell_hub' || ecosystemA.type === 'bench_dumbbell') {
    if (exerciseB.equipment.toLowerCase().includes('barbell') ||
        exerciseB.equipment.toLowerCase().includes('dumbbell') ||
        exerciseB.equipment.toLowerCase().includes('bodyweight')) {
      return 30;
    }
  }
  
  if (ecosystemA.type === 'cable_hub') {
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
  
  return 5; // Poor efficiency fallback
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
