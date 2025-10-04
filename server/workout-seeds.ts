import { storage } from './storage.js';
import { airtableService } from './airtable.js';

interface SeedWorkout {
  template: {
    name: string;
    description: string;
    workoutType: string;
    category: string;
    difficulty: number;
    estimatedDuration: number;
    isPublic: boolean;
    timingStructure: string;
    totalRounds?: number;
    workDuration?: number;
    restDuration?: number;
  };
  sections: Array<{
    name: string;
    sectionType: string;
    orderIndex: number;
    duration?: number;
    rounds?: number;
    restBetweenRounds?: number;
    instructions?: string;
    exercises: Array<{
      exerciseId: number;
      orderIndex: number;
      sets?: number;
      reps?: string;
      weight?: string;
      restSeconds?: number;
      workSeconds?: number;
      restAfterExercise?: number;
      targetReps?: number;
      notes?: string;
      modification?: string;
    }>;
  }>;
}

const workoutSeeds: SeedWorkout[] = [
  // 1. 9-Minute Power Block - High-Intensity Circuit
  {
    template: {
      name: "9-Minute Power Block",
      description: "High-intensity circuit focusing on explosive power, tricep strength, and lower body plyometrics. Perfect for time-efficient training.",
      workoutType: "cross_training",
      category: "Timed Circuit",
      difficulty: 4,
      estimatedDuration: 9,
      isPublic: true,
      timingStructure: "circuit",
      totalRounds: 3,
      workDuration: 30,  // 30 seconds work
      restDuration: 30,  // 30 seconds rest
    },
    sections: [
      {
        name: "Power Circuit",
        sectionType: "main",
        orderIndex: 0,
        rounds: 3,
        restBetweenRounds: 0,
        instructions: "Complete 3 rounds of all exercises. 30 seconds work, 30 seconds rest between exercises. Focus on explosive power and proper form.",
        exercises: [
          { 
            exerciseId: 801608340, // Dumbbell Clean and Press
            orderIndex: 0,
            workSeconds: 30,
            restAfterExercise: 30,
            notes: "Explosive power - drive through heels, catch at shoulders with control"
          },
          { 
            exerciseId: 1540917265, // Tricep Pushdown (Rope)
            orderIndex: 1,
            workSeconds: 30,
            restAfterExercise: 30,
            notes: "Control the eccentric - 2 second squeeze at full extension, split rope at bottom"
          },
          { 
            exerciseId: 199586794, // Squat Jump
            orderIndex: 2,
            workSeconds: 30,
            restAfterExercise: 30,
            notes: "Soft landing, immediate rebound - maximize height each rep"
          }
        ]
      }
    ]
  },
  
  // 2. Classic Push Day - Traditional Strength Training
  {
    template: {
      name: "Classic Push Day",
      description: "Traditional upper body push workout focusing on chest, shoulders, and triceps with progressive overload",
      workoutType: "strength",
      category: "Upper Body",
      difficulty: 3,
      estimatedDuration: 60,
      isPublic: true,
      timingStructure: "traditional",
    },
    sections: [
      {
        name: "Warm-up",
        sectionType: "warmup",
        orderIndex: 0,
        duration: 10,
        instructions: "Light cardio and dynamic stretching to prepare for pushing movements",
        exercises: [
          { exerciseId: 72654685, orderIndex: 0, workSeconds: 300, notes: "5 minutes light cardio" }, // Treadmill
          { exerciseId: 50300173, orderIndex: 1, sets: 2, reps: "10", notes: "Shoulder activation" }, // Band Pull-Apart
        ]
      },
      {
        name: "Main Work",
        sectionType: "main",
        orderIndex: 1,
        instructions: "Progressive overload focusing on compound movements first, then isolation",
        exercises: [
          { exerciseId: 1638050019, orderIndex: 0, sets: 4, reps: "8", restSeconds: 120, notes: "Focus on controlled descent" }, // Barbell Bench Press
          { exerciseId: 192231439, orderIndex: 1, sets: 3, reps: "10", restSeconds: 90, notes: "Keep core tight throughout movement" }, // Barbell Shoulder Press
          { exerciseId: 368233190, orderIndex: 2, sets: 3, reps: "12", restSeconds: 60, notes: "Focus on mind-muscle connection" }, // Cable Lateral Raise
          { exerciseId: 340289936, orderIndex: 3, sets: 3, reps: "12", restSeconds: 60, notes: "Keep elbows close to body" }, // Bench Dip
        ]
      },
      {
        name: "Cool-down",
        sectionType: "cooldown",
        orderIndex: 2,
        duration: 10,
        instructions: "Static stretching focusing on chest, shoulders, and triceps",
        exercises: [
          { exerciseId: 50300173, orderIndex: 0, workSeconds: 180, notes: "Hold stretches for 30 seconds each" }, // Band Pull-Apart for stretching
        ]
      }
    ]
  }
];

export async function seedWorkouts() {
  console.log('Starting workout template seeding...');
  
  try {
    for (const workoutSeed of workoutSeeds) {
      console.log(`Creating workout template: ${workoutSeed.template.name}`);
      
      // Create the workout template
      const template = await storage.createWorkoutTemplate(workoutSeed.template);
      console.log(`Created template with ID: ${template.id}`);
      
      // Create sections for this template
      for (const sectionData of workoutSeed.sections) {
        const { exercises: _, ...sectionWithoutExercises } = sectionData;
        const section = await storage.createWorkoutSection({
          ...sectionWithoutExercises,
          workoutTemplateId: template.id
        });
        console.log(`Created section: ${section.name} with ID: ${section.id}`);
        
        // Create exercises for this section
        // For circuit workouts with rounds, we need to expand the exercises
        const rounds = sectionData.rounds || 1;
        const isCircuit = workoutSeed.template.timingStructure === 'circuit' && rounds > 1;
        
        if (isCircuit) {
          // Circuit workout: repeat all exercises for each round
          for (let round = 0; round < rounds; round++) {
            for (const exerciseData of sectionData.exercises) {
              // Fetch exercise details from Airtable to snapshot coach context
              const airtableExercise = await storage.getExercise(exerciseData.exerciseId);
              
              if (!airtableExercise) {
                throw new Error(
                  `❌ CRITICAL: Exercise ID ${exerciseData.exerciseId} not found in database! ` +
                  `Cannot create workout "${workoutSeed.template.name}" without complete exercise data. ` +
                  `Please verify the exercise exists in Airtable.`
                );
              }
              
              // Create workout exercise with snapshot of Airtable data
              // Update orderIndex to maintain sequence across rounds
              const globalOrderIndex = round * sectionData.exercises.length + exerciseData.orderIndex;
              const exercise = await storage.createWorkoutExercise({
                ...exerciseData,
                orderIndex: globalOrderIndex,
                workoutSectionId: section.id,
                // Snapshot AI Coach context from Airtable
                primaryMuscleGroup: airtableExercise.primaryMuscleGroup,
                movementPattern: airtableExercise.movementPattern,
                equipmentPrimary: airtableExercise.equipmentPrimary,
                equipmentSecondary: airtableExercise.equipmentSecondary,
                coachingBulletPoints: airtableExercise.coachingBulletPoints
              });
              console.log(`✓ Created exercise (Round ${round + 1}): ${airtableExercise.name} (ID: ${exercise.id})`);
            }
          }
        } else {
          // Traditional workout: create exercises as-is
          for (const exerciseData of sectionData.exercises) {
            // Fetch exercise details from Airtable to snapshot coach context
            const airtableExercise = await storage.getExercise(exerciseData.exerciseId);
            
            if (!airtableExercise) {
              throw new Error(
                `❌ CRITICAL: Exercise ID ${exerciseData.exerciseId} not found in database! ` +
                `Cannot create workout "${workoutSeed.template.name}" without complete exercise data. ` +
                `Please verify the exercise exists in Airtable.`
              );
            }
            
            // Create workout exercise with snapshot of Airtable data
            const exercise = await storage.createWorkoutExercise({
              ...exerciseData,
              workoutSectionId: section.id,
              // Snapshot AI Coach context from Airtable
              primaryMuscleGroup: airtableExercise.primaryMuscleGroup,
              movementPattern: airtableExercise.movementPattern,
              equipmentPrimary: airtableExercise.equipmentPrimary,
              equipmentSecondary: airtableExercise.equipmentSecondary,
              coachingBulletPoints: airtableExercise.coachingBulletPoints
            });
            console.log(`✓ Created exercise: ${airtableExercise.name} (ID: ${exercise.id})`);
          }
        }
      }
    }
    
    console.log('✅ Workout template seeding completed successfully!');
    console.log(`Created ${workoutSeeds.length} workout templates with sections and exercises`);
    
  } catch (error) {
    console.error('❌ Error seeding workout templates:', error);
    throw error;
  }
}

// Export the seed data for potential use elsewhere
export { workoutSeeds };