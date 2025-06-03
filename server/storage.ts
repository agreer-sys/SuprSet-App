import { 
  exercises, 
  workoutSessions, 
  exercisePairings,
  type Exercise, 
  type InsertExercise,
  type WorkoutSession,
  type InsertWorkoutSession,
  type ExercisePairing,
  type InsertExercisePairing
} from "@shared/schema";

export interface IStorage {
  // Exercise methods
  getExercise(id: number): Promise<Exercise | undefined>;
  getAllExercises(): Promise<Exercise[]>;
  getExercisesByCategory(category: string): Promise<Exercise[]>;
  getExercisesByEquipment(equipment: string): Promise<Exercise[]>;
  searchExercises(query: string): Promise<Exercise[]>;
  createExercise(exercise: InsertExercise): Promise<Exercise>;

  // Workout session methods
  getWorkoutSession(id: number): Promise<WorkoutSession | undefined>;
  createWorkoutSession(session: InsertWorkoutSession): Promise<WorkoutSession>;
  updateWorkoutSession(id: number, updates: Partial<WorkoutSession>): Promise<WorkoutSession | undefined>;

  // Exercise pairing methods
  getExercisePairings(exerciseAId: number): Promise<ExercisePairing[]>;
  createExercisePairing(pairing: InsertExercisePairing): Promise<ExercisePairing>;
}

export class MemStorage implements IStorage {
  private exercises: Map<number, Exercise>;
  private workoutSessions: Map<number, WorkoutSession>;
  private exercisePairings: Map<number, ExercisePairing>;
  private currentExerciseId: number;
  private currentSessionId: number;
  private currentPairingId: number;

  constructor() {
    this.exercises = new Map();
    this.workoutSessions = new Map();
    this.exercisePairings = new Map();
    this.currentExerciseId = 1;
    this.currentSessionId = 1;
    this.currentPairingId = 1;
    this.seedData();
  }

  private seedData() {
    // Seed comprehensive exercise database
    const exerciseData: Omit<Exercise, 'id'>[] = [
      {
        name: "Bench Press",
        category: "push",
        equipment: "barbell",
        primaryMuscles: ["chest", "triceps"],
        secondaryMuscles: ["anterior deltoids"],
        movementPattern: "horizontal_push",
        difficulty: 3,
        instructions: {
          setup: "Lie on a flat bench with your feet firmly planted on the ground. Grip the barbell with hands slightly wider than shoulder-width apart.",
          execution: [
            "Lower the bar slowly to your chest, keeping elbows at 45-degree angle",
            "Pause briefly when the bar touches your chest", 
            "Press the bar back up explosively to starting position",
            "Maintain tight core and shoulder blade retraction throughout"
          ],
          safetyTips: [
            "Always use a spotter when lifting heavy weights",
            "Keep your wrists straight and aligned",
            "Don't bounce the bar off your chest"
          ]
        }
      },
      {
        name: "Bent-Over Row",
        category: "pull",
        equipment: "barbell",
        primaryMuscles: ["lats", "rhomboids", "middle traps"],
        secondaryMuscles: ["biceps", "rear delts"],
        movementPattern: "horizontal_pull",
        difficulty: 3,
        instructions: {
          setup: "Stand with feet shoulder-width apart, hinge at hips and lean forward with slight knee bend. Grip barbell with overhand grip.",
          execution: [
            "Pull the bar towards your lower chest/upper abdomen",
            "Squeeze shoulder blades together at the top",
            "Lower with control back to starting position",
            "Keep core tight and spine neutral throughout"
          ],
          safetyTips: [
            "Don't round your back",
            "Keep the bar close to your body",
            "Use appropriate weight to maintain form"
          ]
        }
      },
      {
        name: "Squat",
        category: "legs",
        equipment: "barbell",
        primaryMuscles: ["quadriceps", "glutes"],
        secondaryMuscles: ["hamstrings", "calves", "core"],
        movementPattern: "squat",
        difficulty: 4,
        instructions: {
          setup: "Position barbell on upper back, feet shoulder-width apart, toes slightly pointed out.",
          execution: [
            "Initiate movement by pushing hips back",
            "Lower until thighs are parallel to floor",
            "Drive through heels to return to standing",
            "Keep chest up and knees tracking over toes"
          ],
          safetyTips: [
            "Use safety bars in squat rack",
            "Don't let knees cave inward",
            "Maintain neutral spine throughout movement"
          ]
        }
      },
      {
        name: "Pull-ups",
        category: "pull",
        equipment: "bodyweight",
        primaryMuscles: ["lats", "rhomboids"],
        secondaryMuscles: ["biceps", "middle traps"],
        movementPattern: "vertical_pull",
        difficulty: 5,
        instructions: {
          setup: "Hang from pull-up bar with overhand grip, hands slightly wider than shoulders.",
          execution: [
            "Pull your body up until chin clears the bar",
            "Focus on pulling elbows down and back",
            "Lower with control to full arm extension",
            "Maintain tight core throughout"
          ],
          safetyTips: [
            "Don't swing or use momentum",
            "Use assistance if unable to complete full reps",
            "Avoid excessive forward head posture"
          ]
        }
      },
      {
        name: "Deadlift",
        category: "compound",
        equipment: "barbell",
        primaryMuscles: ["hamstrings", "glutes", "erector spinae"],
        secondaryMuscles: ["lats", "traps", "rhomboids", "core"],
        movementPattern: "hinge",
        difficulty: 5,
        instructions: {
          setup: "Stand with feet hip-width apart, barbell over mid-foot. Grip bar with hands just outside legs.",
          execution: [
            "Drive through heels and extend hips",
            "Keep bar close to body throughout lift",
            "Stand tall with shoulders back at top",
            "Reverse movement to lower bar with control"
          ],
          safetyTips: [
            "Keep neutral spine throughout movement",
            "Don't round your back",
            "Use proper warm-up progression"
          ]
        }
      },
      {
        name: "Face Pulls",
        category: "pull",
        equipment: "cable",
        primaryMuscles: ["rear delts", "rhomboids"],
        secondaryMuscles: ["middle traps", "external rotators"],
        movementPattern: "horizontal_pull",
        difficulty: 2,
        instructions: {
          setup: "Set cable machine to face height with rope attachment. Stand with feet shoulder-width apart.",
          execution: [
            "Pull rope towards your face, separating handles",
            "Focus on squeezing shoulder blades together",
            "Return to starting position with control",
            "Keep elbows high throughout movement"
          ],
          safetyTips: [
            "Use light weight to focus on form",
            "Don't use momentum",
            "Keep core engaged"
          ]
        }
      },
      {
        name: "Tricep Dips",
        category: "push",
        equipment: "bodyweight",
        primaryMuscles: ["triceps"],
        secondaryMuscles: ["chest", "anterior delts"],
        movementPattern: "vertical_push",
        difficulty: 3,
        instructions: {
          setup: "Position hands on parallel bars or bench edge, legs extended or bent for difficulty adjustment.",
          execution: [
            "Lower body by bending elbows",
            "Descend until shoulders are below elbows",
            "Push back up to starting position",
            "Keep torso upright throughout"
          ],
          safetyTips: [
            "Don't descend too low if you feel shoulder discomfort",
            "Keep shoulders down and back",
            "Progress gradually with depth and reps"
          ]
        }
      },
      {
        name: "Bulgarian Split Squat",
        category: "legs", 
        equipment: "bodyweight",
        primaryMuscles: ["quadriceps", "glutes"],
        secondaryMuscles: ["hamstrings", "calves", "core"],
        movementPattern: "lunge",
        difficulty: 4,
        instructions: {
          setup: "Stand 2-3 feet in front of bench, place rear foot on bench behind you.",
          execution: [
            "Lower into lunge position on front leg",
            "Descend until front thigh is parallel to floor",
            "Drive through front heel to return to start",
            "Complete all reps before switching legs"
          ],
          safetyTips: [
            "Don't let front knee cave inward",
            "Keep most weight on front leg",
            "Maintain upright torso"
          ]
        }
      }
    ];

    exerciseData.forEach(exercise => {
      const id = this.currentExerciseId++;
      this.exercises.set(id, { ...exercise, id });
    });
  }

  async getExercise(id: number): Promise<Exercise | undefined> {
    return this.exercises.get(id);
  }

  async getAllExercises(): Promise<Exercise[]> {
    return Array.from(this.exercises.values());
  }

  async getExercisesByCategory(category: string): Promise<Exercise[]> {
    return Array.from(this.exercises.values()).filter(
      exercise => exercise.category === category
    );
  }

  async getExercisesByEquipment(equipment: string): Promise<Exercise[]> {
    return Array.from(this.exercises.values()).filter(
      exercise => exercise.equipment === equipment
    );
  }

  async searchExercises(query: string): Promise<Exercise[]> {
    const lowercaseQuery = query.toLowerCase();
    return Array.from(this.exercises.values()).filter(
      exercise => 
        exercise.name.toLowerCase().includes(lowercaseQuery) ||
        exercise.primaryMuscles.some(muscle => muscle.toLowerCase().includes(lowercaseQuery)) ||
        exercise.category.toLowerCase().includes(lowercaseQuery)
    );
  }

  async createExercise(insertExercise: InsertExercise): Promise<Exercise> {
    const id = this.currentExerciseId++;
    const exercise: Exercise = { ...insertExercise, id };
    this.exercises.set(id, exercise);
    return exercise;
  }

  async getWorkoutSession(id: number): Promise<WorkoutSession | undefined> {
    return this.workoutSessions.get(id);
  }

  async createWorkoutSession(insertSession: InsertWorkoutSession): Promise<WorkoutSession> {
    const id = this.currentSessionId++;
    const session: WorkoutSession = { ...insertSession, id };
    this.workoutSessions.set(id, session);
    return session;
  }

  async updateWorkoutSession(id: number, updates: Partial<WorkoutSession>): Promise<WorkoutSession | undefined> {
    const session = this.workoutSessions.get(id);
    if (!session) return undefined;
    
    const updatedSession = { ...session, ...updates };
    this.workoutSessions.set(id, updatedSession);
    return updatedSession;
  }

  async getExercisePairings(exerciseAId: number): Promise<ExercisePairing[]> {
    return Array.from(this.exercisePairings.values()).filter(
      pairing => pairing.exerciseAId === exerciseAId
    );
  }

  async createExercisePairing(insertPairing: InsertExercisePairing): Promise<ExercisePairing> {
    const id = this.currentPairingId++;
    const pairing: ExercisePairing = { ...insertPairing, id };
    this.exercisePairings.set(id, pairing);
    return pairing;
  }
}

export const storage = new MemStorage();
