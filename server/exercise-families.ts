// Exercise family groupings for intelligent pairing
// Groups similar exercises that can substitute for each other in pairings

export const EXERCISE_FAMILIES: Record<string, string[]> = {
  // HORIZONTAL PUSH FAMILY
  horizontal_push: [
    "Barbell Bench Press",
    "Dumbell Bench Press",
    "Dumbbell Bench Press", 
    "Incline Dumbbell Bench Press",
    "Decline Dumbbell Bench Press",
    "Push Up",
    "Hand Release Push Up",
    "Medicine Ball Push Up",
    "Plyo Push Up",
    "Flat Dumbbell Pec Fly",
    "Incline Dumbbell Pec Fly",
    "Dumbbell Squeeze Press",
    "Svend Press"
  ],
  
  // HORIZONTAL PULL FAMILY  
  horizontal_pull: [
    "Bent Over Barbell Row",
    "Bent Over Dumbbell Row", 
    "One Arm Dumbbell Row",
    "Chest-supported Dumbbell Row",
    "T Bar Row",
    "TRX Row",
    "Chainsaw Row",
    "Renegade Row"
  ],
  
  // VERTICAL PUSH FAMILY
  vertical_push: [
    "Seated Overhead Dumbbell Press",
    "Seated Arnold Press",
    "Single Arm Dumbbell Press",
    "Landmine Press"
  ],
  
  // VERTICAL PULL FAMILY
  vertical_pull: [
    "Pull Up",
    "Chin Up", 
    "Lat Pulldown",
    "Straight Arm Pulldown"
  ],
  
  // SQUAT FAMILY
  squat_dominant: [
    "Back Squat",
    "Front Squat",
    "Goblet Squat",
    "Dumbbell Squat",
    "Leg Press",
    "Jump Squats"
  ],
  
  // HINGE FAMILY
  hinge_dominant: [
    "Deadlift",
    "Romanian Deadlift",
    "Sumo Deadlift",
    "Stiff Leg Deadlift",
    "Hip Thrusts",
    "Good Mornings"
  ],
  
  // UNILATERAL LOWER FAMILY
  unilateral_lower: [
    "Walking Lunges",
    "Bulgarian Split Squats",
    "Single Leg RDL",
    "Step Ups",
    "Single Leg Squats",
    "Lateral Lunges"
  ],
  
  // BICEP FAMILY
  bicep_dominant: [
    "Bicep Curls",
    "Hammer Curls",
    "Cable Curls",
    "Concentration Curls",
    "Preacher Curls"
  ],
  
  // TRICEP FAMILY
  tricep_dominant: [
    "Tricep Extensions",
    "Overhead Tricep Press", 
    "Close Grip Push Ups",
    "Tricep Dips",
    "Diamond Push Ups"
  ]
};

// Family-based pairing rules - these families work well together
export const FAMILY_PAIRINGS: Record<string, string[]> = {
  horizontal_push: ["horizontal_pull"],
  horizontal_pull: ["horizontal_push"],
  vertical_push: ["vertical_pull"],  
  vertical_pull: ["vertical_push"],
  squat_dominant: ["hinge_dominant"],
  hinge_dominant: ["squat_dominant", "unilateral_lower"],
  unilateral_lower: ["hinge_dominant"],
  bicep_dominant: ["tricep_dominant"],
  tricep_dominant: ["bicep_dominant"]
};

// Get the family of an exercise
export function getExerciseFamily(exerciseName: string): string | null {
  for (const [family, exercises] of Object.entries(EXERCISE_FAMILIES)) {
    if (exercises.includes(exerciseName)) {
      return family;
    }
  }
  return null;
}

// Check if two exercises are compatible based on family rules
export function areFamiliesCompatible(exerciseA: string, exerciseB: string): boolean {
  const familyA = getExerciseFamily(exerciseA);
  const familyB = getExerciseFamily(exerciseB);
  
  if (!familyA || !familyB) return false;
  
  const compatibleFamilies = FAMILY_PAIRINGS[familyA] || [];
  return compatibleFamilies.includes(familyB);
}