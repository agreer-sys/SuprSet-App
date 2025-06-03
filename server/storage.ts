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
import { airtableService } from "./airtable";

export interface IStorage {
  // Exercise methods
  getExercise(id: number): Promise<Exercise | undefined>;
  getAllExercises(): Promise<Exercise[]>;
  getExercisesByCategory(category: string): Promise<Exercise[]>;
  getExercisesByExerciseType(exerciseType: string): Promise<Exercise[]>;
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

export class AirtableStorage implements IStorage {
  private exerciseCache: Map<number, Exercise> = new Map();
  private workoutSessions: Map<number, WorkoutSession> = new Map();
  private exercisePairings: Map<number, ExercisePairing> = new Map();
  private currentSessionId: number = 1;
  private currentPairingId: number = 1;
  private cacheExpiry: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // No seed data needed - we'll fetch from Airtable
  }

  private async refreshCache(): Promise<void> {
    if (Date.now() < this.cacheExpiry && this.exerciseCache.size > 0) {
      return; // Cache is still valid
    }

    try {
      const exercises = await airtableService.getAllExercises();
      this.exerciseCache.clear();
      exercises.forEach(exercise => {
        this.exerciseCache.set(exercise.id, exercise);
      });
      this.cacheExpiry = Date.now() + this.CACHE_DURATION;
      console.log(`Successfully loaded ${exercises.length} exercises from Airtable`);
    } catch (error) {
      console.error("Failed to refresh exercise cache:", error);
      throw error;
    }
  }

  private loadSampleExercises(): void {
    const sampleExercises: Exercise[] = [
      {
        id: 1,
        name: "Bench Press",
        category: "push",
        equipment: "barbell",
        primaryMuscles: ["chest", "triceps"],
        secondaryMuscles: ["anterior deltoids"],
        movementPattern: "horizontal_push",
        difficulty: 3,
        instructions: {
          setup: "Lie on a flat bench with your feet firmly planted on the ground.",
          execution: ["Lower the bar slowly to your chest", "Press back up explosively"],
          safetyTips: ["Always use a spotter", "Keep wrists straight"]
        },
        anchorType: "Anchored",
        setupTime: "Medium",
        equipmentZone: "Barbell Zone",
        bestPairedWith: ["Pull", "Back"],
        coachingTips: ["Focus on controlled movement", "Maintain shoulder blade retraction"],
        mistakes: ["Bouncing off chest", "Flaring elbows too wide"],
        variations: ["Incline Bench Press", "Dumbbell Bench Press"]
      },
      {
        id: 2,
        name: "Bent-Over Row",
        category: "pull",
        equipment: "barbell",
        primaryMuscles: ["lats", "rhomboids"],
        secondaryMuscles: ["biceps", "rear delts"],
        movementPattern: "horizontal_pull",
        difficulty: 3,
        instructions: {
          setup: "Hinge at hips with slight knee bend, grip barbell with overhand grip.",
          execution: ["Pull bar towards lower chest", "Squeeze shoulder blades together"],
          safetyTips: ["Don't round your back", "Keep bar close to body"]
        },
        anchorType: "Mobile",
        setupTime: "Low",
        equipmentZone: "Barbell Zone",
        bestPairedWith: ["Push", "Chest"],
        coachingTips: ["Lead with elbows", "Keep core tight"],
        mistakes: ["Using too much momentum", "Rounding the back"],
        variations: ["T-Bar Row", "Cable Row"]
      },
      {
        id: 3,
        name: "Face Pulls",
        category: "pull",
        equipment: "cable",
        primaryMuscles: ["rear delts", "rhomboids"],
        secondaryMuscles: ["middle traps"],
        movementPattern: "horizontal_pull",
        difficulty: 2,
        instructions: {
          setup: "Set cable to face height with rope attachment.",
          execution: ["Pull rope towards face", "Separate handles at end"],
          safetyTips: ["Use light weight", "Keep elbows high"]
        },
        anchorType: "Anchored",
        setupTime: "Low",
        equipmentZone: "Cable Zone",
        bestPairedWith: ["Push", "Chest", "Core"],
        coachingTips: ["Focus on rear delt squeeze", "Control the negative"],
        mistakes: ["Using too much weight", "Not separating handles"],
        variations: ["Band Face Pulls", "Reverse Fly"]
      }
    ];

    sampleExercises.forEach(exercise => {
      this.exerciseCache.set(exercise.id, exercise);
    });
  }

  async getExercise(id: number): Promise<Exercise | undefined> {
    await this.refreshCache();
    return this.exerciseCache.get(id);
  }

  async getAllExercises(): Promise<Exercise[]> {
    await this.refreshCache();
    return Array.from(this.exerciseCache.values());
  }

  async getExercisesByCategory(category: string): Promise<Exercise[]> {
    await this.refreshCache();
    return Array.from(this.exerciseCache.values()).filter(exercise => 
      exercise.exerciseType?.toLowerCase() === category.toLowerCase() ||
      exercise.primaryMuscleGroup?.toLowerCase() === category.toLowerCase() ||
      exercise.exerciseCategory.some(cat => cat.toLowerCase() === category.toLowerCase()) ||
      exercise.category.toLowerCase() === category.toLowerCase()
    );
  }

  async getExercisesByExerciseType(exerciseType: string): Promise<Exercise[]> {
    await this.refreshCache();
    return Array.from(this.exerciseCache.values()).filter(exercise => 
      exercise.exerciseType?.toLowerCase() === exerciseType.toLowerCase()
    );
  }

  async getExercisesByEquipment(equipment: string): Promise<Exercise[]> {
    await this.refreshCache();
    return Array.from(this.exerciseCache.values()).filter(exercise => 
      exercise.equipment.toLowerCase().includes(equipment.toLowerCase())
    );
  }

  async searchExercises(query: string): Promise<Exercise[]> {
    await this.refreshCache();
    const lowercaseQuery = query.toLowerCase();
    return Array.from(this.exerciseCache.values()).filter(exercise => 
      exercise.name.toLowerCase().includes(lowercaseQuery) ||
      exercise.primaryMuscleGroup?.toLowerCase().includes(lowercaseQuery) ||
      exercise.exerciseType?.toLowerCase().includes(lowercaseQuery) ||
      exercise.equipment.toLowerCase().includes(lowercaseQuery) ||
      exercise.tags.some(tag => tag.toLowerCase().includes(lowercaseQuery)) ||
      exercise.exerciseCategory.some(cat => cat.toLowerCase().includes(lowercaseQuery))
    );
  }

  async createExercise(insertExercise: InsertExercise): Promise<Exercise> {
    // For Airtable integration, this would need to create records in Airtable
    // For now, we'll throw an error since this is read-only
    throw new Error("Creating exercises not supported with Airtable integration");
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

export const storage = new AirtableStorage();
