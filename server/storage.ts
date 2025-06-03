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
    } catch (error) {
      console.error("Failed to refresh exercise cache:", error);
      throw error;
    }
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
    return Array.from(this.exerciseCache.values()).filter(
      exercise => exercise.category === category
    );
  }

  async getExercisesByEquipment(equipment: string): Promise<Exercise[]> {
    await this.refreshCache();
    return Array.from(this.exerciseCache.values()).filter(
      exercise => exercise.equipment === equipment
    );
  }

  async searchExercises(query: string): Promise<Exercise[]> {
    await this.refreshCache();
    const lowercaseQuery = query.toLowerCase();
    return Array.from(this.exerciseCache.values()).filter(
      exercise => 
        exercise.name.toLowerCase().includes(lowercaseQuery) ||
        exercise.primaryMuscles.some(muscle => muscle.toLowerCase().includes(lowercaseQuery)) ||
        exercise.category.toLowerCase().includes(lowercaseQuery)
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
