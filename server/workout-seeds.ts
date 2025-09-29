import { storage } from './storage.js';

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
    restBetweenExercises?: number;
    instructions?: string;
    exercises: Array<{
      exerciseId: number;
      orderIndex: number;
      sets?: number;
      reps?: number;
      duration?: number;
      weight?: number;
      distance?: number;
      restTime?: number;
      instructions?: string;
    }>;
  }>;
}

const workoutSeeds: SeedWorkout[] = [
  // 1. Classic Push Day - Traditional Strength Training
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
          { exerciseId: 72654685, orderIndex: 0, duration: 300, instructions: "5 minutes light cardio" }, // Treadmill
          { exerciseId: 50300173, orderIndex: 1, sets: 2, reps: 10, instructions: "Shoulder activation" }, // Band Pull-Apart
        ]
      },
      {
        name: "Main Work",
        sectionType: "main",
        orderIndex: 1,
        restBetweenExercises: 90,
        instructions: "Progressive overload focusing on compound movements first, then isolation",
        exercises: [
          { exerciseId: 1638050019, orderIndex: 0, sets: 4, reps: 8, restTime: 120, instructions: "Focus on controlled descent" }, // Barbell Bench Press
          { exerciseId: 192231439, orderIndex: 1, sets: 3, reps: 10, restTime: 90, instructions: "Keep core tight throughout movement" }, // Barbell Shoulder Press
          { exerciseId: 368233190, orderIndex: 2, sets: 3, reps: 12, restTime: 60, instructions: "Focus on mind-muscle connection" }, // Cable Lateral Raise
          { exerciseId: 340289936, orderIndex: 3, sets: 3, reps: 12, restTime: 60, instructions: "Keep elbows close to body" }, // Bench Dip
        ]
      },
      {
        name: "Cool-down",
        sectionType: "cooldown",
        orderIndex: 2,
        duration: 10,
        instructions: "Static stretching focusing on chest, shoulders, and triceps",
        exercises: [
          { exerciseId: 50300173, orderIndex: 0, duration: 180, instructions: "Hold stretches for 30 seconds each" }, // Band Pull-Apart for stretching
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
        const section = await storage.createWorkoutSection({
          ...sectionData,
          workoutTemplateId: template.id,
          exercises: undefined // Remove exercises from section data
        });
        console.log(`Created section: ${section.name} with ID: ${section.id}`);
        
        // Create exercises for this section
        for (const exerciseData of sectionData.exercises) {
          const exercise = await storage.createWorkoutExercise({
            ...exerciseData,
            workoutSectionId: section.id
          });
          console.log(`Created exercise with ID: ${exercise.id} in section: ${section.name}`);
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