/**
 * AI TRAINING EQUIPMENT CATALOG
 * 
 * This is the curated equipment list specifically designed for AI training and computer vision.
 * It includes highly specific equipment types that are important for the AI model to distinguish.
 * This list is used for both image labeling and batch upload consistency.
 */

export const AI_TRAINING_EQUIPMENT: readonly string[] = [
  "Abductor Machine",
  "Adductor Machine", 
  "Adjustable Bench",
  "Assault Bike",
  "Assisted Pull-Up Machine",
  "Back Extension Bench",
  "Barbell",
  "Bodyweight",
  "Cable Tower",
  "Calf Raise Machine (Cable Stack)",
  "Calf Raise Machine (Plate Loaded)",
  "Chest Press Machine (Cable Stack)",
  "Chest Press Machine (Plate Loaded)",
  "Dip Station",
  "Dumbbells",
  "Elliptical",
  "EZ Barbell",
  "Functional Trainer",
  "Glute Bridge Machine (Cable Stack)",
  "Glute Bridge Machine (Plate Loaded)",
  "Glute Ham Raise Unit",
  "Glute Kickback Machine",
  "Hack Squat Machine (Cable Stack)",
  "Hack Squat Machine (Plate Loaded)",
  "Incline Chest Press Machine",
  "Jacobs Ladder",
  "Jump Rope",
  "Kettlebells",
  "Lateral Raise Machine",
  "Lat Pulldown Machine",
  "Laying Leg Curl Machine",
  "Leg Curl Machine",
  "Leg Extension Machine",
  "Leg Extension / Leg Curl Machine",
  "Leg Press Machine (Cable Stack)",
  "Leg Press Machine (Plate Loaded)",
  "Loop Band",
  "Machine Row",
  "Mat",
  "Medicine Ball",
  "Nordic Hamstring Curl Machine",
  "Olympic Decline Bench",
  "Olympic Flat Bench",
  "Olympic Incline Bench",
  "Olympic Military Bench",
  "Olympic Plate Tree",
  "Pec Fly Machine",
  "Pec Fly / Rear Delt Machine",
  "Plyo Box",
  "Preacher Curl Machine",
  "Pull-Up Bar",
  "Reverse Fly Machine",
  "Reverse Hyper Machine",
  "Roman Chair Machine",
  "Rower",
  "Seated Cable Row Machine",
  "Shoulder Press Machine (Cable Stack)",
  "Shoulder Press Machine (Plate Loaded)",
  "Ski Erg",
  "Sled",
  "Smith Machine",
  "Stability Ball",
  "Stair Climber",
  "Standing Leg Curl Machine",
  "Stationary Bike",
  "Strength Band",
  "T-Bar Row Machine (Cable Stack)",
  "T-Bar Row Machine (Plate Loaded)",
  "Treadmill",
  "Tricep Extension Machine",
  "TRX Unit",
  "Weight Plates"
] as const;

/**
 * Type for AI training equipment (useful for TypeScript type checking)
 */
export type AITrainingEquipment = typeof AI_TRAINING_EQUIPMENT[number];

/**
 * Get all AI training equipment as array
 */
export function getAITrainingEquipment(): string[] {
  return [...AI_TRAINING_EQUIPMENT];
}

/**
 * Check if equipment is in the AI training catalog
 */
export function isValidAITrainingEquipment(equipment: string): equipment is AITrainingEquipment {
  return AI_TRAINING_EQUIPMENT.includes(equipment as AITrainingEquipment);
}

/**
 * Generate HTML option tags for use in HTML select elements
 */
export function generateHTMLOptions(selectedEquipment?: string): string {
  return AI_TRAINING_EQUIPMENT
    .map(equipment => `<option value="${equipment}" ${selectedEquipment === equipment ? 'selected' : ''}>${equipment}</option>`)
    .join('\n                      ');
}