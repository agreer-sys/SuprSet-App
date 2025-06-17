// Curated trainer-approved exercise pairings
// Key: Exercise A name, Value: Array of approved Exercise B names

export const TRAINER_APPROVED_PAIRS: Record<string, string[]> = {
  // PUSH EXERCISES
  "Barbell Bench Press": [
    "Bent Over Barbell Row",
    "Seated Cable Row", 
    "T-Bar Row",
    "Single Arm Dumbbell Row",
    "Lat Pulldown"
  ],
  
  "Dumbbell Bench Press": [
    "Bent Over Dumbbell Row",
    "Single Arm Dumbbell Row",
    "Chest Supported Row",
    "Seated Cable Row"
  ],
  
  "Push Ups": [
    "Inverted Rows",
    "TRX Rows", 
    "Band Pull Aparts",
    "Face Pulls"
  ],
  
  "Overhead Press": [
    "Lat Pulldown",
    "Pull Ups",
    "Chin Ups",
    "High Cable Row"
  ],
  
  "Dumbbell Shoulder Press": [
    "Rear Delt Flyes",
    "Face Pulls",
    "Band Pull Aparts",
    "Reverse Flyes"
  ],
  
  // PULL EXERCISES
  "Bent Over Barbell Row": [
    "Barbell Bench Press",
    "Incline Dumbbell Press",
    "Push Ups",
    "Dips"
  ],
  
  "Pull Ups": [
    "Overhead Press",
    "Dumbbell Shoulder Press",
    "Push Ups",
    "Pike Push Ups"
  ],
  
  "Lat Pulldown": [
    "Overhead Press",
    "Incline Dumbbell Press",
    "Landmine Press"
  ],
  
  // SQUAT EXERCISES  
  "Back Squat": [
    "Romanian Deadlift",
    "Good Mornings",
    "Hip Thrusts",
    "Glute Bridges"
  ],
  
  "Front Squat": [
    "Romanian Deadlift",
    "Stiff Leg Deadlift",
    "Hip Thrusts"
  ],
  
  "Goblet Squat": [
    "Single Leg RDL",
    "Hip Thrusts",
    "Glute Bridges",
    "Calf Raises"
  ],
  
  // HINGE EXERCISES
  "Deadlift": [
    "Front Squat",
    "Bulgarian Split Squats",
    "Walking Lunges",
    "Step Ups"
  ],
  
  "Romanian Deadlift": [
    "Back Squat",
    "Front Squat",
    "Goblet Squat",
    "Jump Squats"
  ],
  
  "Hip Thrusts": [
    "Back Squat", 
    "Front Squat",
    "Bulgarian Split Squats",
    "Single Leg Squats"
  ],
  
  // LUNGE EXERCISES
  "Walking Lunges": [
    "Deadlift",
    "Romanian Deadlift",
    "Good Mornings",
    "Hip Thrusts"
  ],
  
  "Bulgarian Split Squats": [
    "Romanian Deadlift",
    "Single Leg RDL",
    "Hip Thrusts"
  ],
  
  // ACCESSORIES - More flexible pairing
  "Bicep Curls": [
    "Tricep Extensions",
    "Overhead Tricep Press",
    "Close Grip Push Ups",
    "Tricep Dips"
  ],
  
  "Tricep Extensions": [
    "Bicep Curls",
    "Hammer Curls", 
    "Cable Curls",
    "Concentration Curls"
  ],
  
  "Calf Raises": [
    "Tibialis Raises",
    "Ankle Circles",
    "Heel Walks"
  ]
};

// Function to get trainer-approved pairs for an exercise
export function getTrainerApprovedPairs(exerciseName: string): string[] {
  return TRAINER_APPROVED_PAIRS[exerciseName] || [];
}

// Function to check if a pairing is trainer-approved
export function isTrainerApprovedPair(exerciseA: string, exerciseB: string): boolean {
  const approvedPairs = TRAINER_APPROVED_PAIRS[exerciseA] || [];
  return approvedPairs.includes(exerciseB);
}