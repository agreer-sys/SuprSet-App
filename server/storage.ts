import { 
  exercises, 
  workoutSessions, 
  exercisePairings,
  users,
  contributions,
  type Exercise, 
  type InsertExercise,
  type WorkoutSession,
  type InsertWorkoutSession,
  type ExercisePairing,
  type InsertExercisePairing,
  type User,
  type UpsertUser,
  type Contribution,
  type InsertContribution
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
  
  // User methods (for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  
  // Contribution methods
  createContribution(contribution: InsertContribution): Promise<Contribution>;
  getUserContributions(userId: string): Promise<Contribution[]>;
  getContributionStats(userId: string): Promise<{ total: number; verified: number }>;
  
  // Training data export methods
  exportTrainingData(dataset?: string): Promise<Contribution[]>;
  getTrainingDataStats(): Promise<{
    total: number;
    verified: number;
    byEquipment: Record<string, number>;
    byDataset: Record<string, number>;
  }>;
}

export class AirtableStorage implements IStorage {
  private exerciseCache: Map<number, Exercise> = new Map();
  private exerciseOrder: Exercise[] = []; // Preserve original order from Airtable
  private workoutSessions: Map<number, WorkoutSession> = new Map();
  private exercisePairings: Map<number, ExercisePairing> = new Map();
  private users: Map<string, User> = new Map(); // In-memory user storage for auth
  private contributions: Map<string, Contribution> = new Map(); // In-memory contribution storage
  private userContributions: Map<string, number> = new Map(); // Track user contribution counts
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
      this.exerciseOrder = exercises; // Preserve original Airtable order
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
    return this.exerciseOrder; // Return exercises in original Airtable order
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
    const allExercises = Array.from(this.exerciseCache.values());
    console.log(`Filtering for Exercise Type: "${exerciseType}"`);
    console.log(`Sample exercise types:`, allExercises.slice(0, 5).map(e => ({ name: e.name, exerciseType: e.exerciseType })));
    
    const filtered = allExercises.filter(exercise => 
      exercise.exerciseType?.toLowerCase() === exerciseType.toLowerCase()
    );
    
    console.log(`Found ${filtered.length} exercises with Exercise Type "${exerciseType}"`);
    return filtered;
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

  // User methods for Replit Auth
  async getUser(id: string): Promise<User | undefined> {
    return this.users.get(id);
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const existingUser = this.users.get(userData.id);
    const user: User = {
      ...userData,
      createdAt: existingUser?.createdAt || new Date(),
      updatedAt: new Date(),
    };
    this.users.set(userData.id, user);
    return user;
  }

  // Contribution methods
  async createContribution(insertContribution: InsertContribution): Promise<Contribution> {
    const id = `contrib_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Process image data for AI training optimization
    const imageData = insertContribution.imageData;
    let imageWidth = 640;
    let imageHeight = 480;
    let imageSize = imageData.length;
    
    // Extract image dimensions from base64 data if possible
    if (imageData.startsWith('data:image/')) {
      try {
        const base64Data = imageData.split(',')[1];
        imageSize = Math.floor(base64Data.length * 0.75); // Approximate size
      } catch (e) {
        console.warn('Failed to process image data:', e);
      }
    }
    
    // Generate equipment tags for better categorization
    const equipmentTags = this.generateEquipmentTags(insertContribution.equipment);
    
    const contribution: Contribution = {
      ...insertContribution,
      id,
      verified: false,
      votes: 0,
      tags: equipmentTags,
      imageHash: this.generateImageHash(imageData),
      imageSize,
      imageWidth,
      imageHeight,
      moderationStatus: 'pending',
      trainingSet: this.assignTrainingSet(), // Auto-assign to train/validation/test
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Store in memory (for now)
    this.contributions.set(contribution.id, contribution);

    // Update user contribution count
    const currentCount = this.userContributions.get(contribution.userId) || 0;
    this.userContributions.set(contribution.userId, currentCount + 1);

    console.log('New contribution created:', {
      id: contribution.id,
      userId: contribution.userId,
      equipment: contribution.equipment,
      confidence: contribution.confidence,
      trainingSet: contribution.trainingSet,
      tags: contribution.tags,
      totalUserContributions: currentCount + 1
    });

    return contribution;
  }

  private generateEquipmentTags(equipment: string): string[] {
    const tags = [equipment.toLowerCase()];
    
    // Add category tags based on equipment type
    const categoryMap: Record<string, string[]> = {
      'bench': ['pressing', 'chest', 'upper_body'],
      'squat rack': ['squatting', 'legs', 'lower_body', 'compound'],
      'dumbbell': ['free_weights', 'versatile', 'unilateral'],
      'barbell': ['free_weights', 'compound', 'bilateral'],
      'cable': ['variable_resistance', 'isolation', 'controlled'],
      'machine': ['guided_motion', 'safety', 'isolation']
    };
    
    for (const [key, additionalTags] of Object.entries(categoryMap)) {
      if (equipment.toLowerCase().includes(key)) {
        tags.push(...additionalTags);
      }
    }
    
    return [...new Set(tags)]; // Remove duplicates
  }

  private generateImageHash(imageData: string): string {
    // Simple hash generation for duplicate detection
    let hash = 0;
    for (let i = 0; i < imageData.length; i++) {
      const char = imageData.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  private assignTrainingSet(): 'train' | 'validation' | 'test' {
    const rand = Math.random();
    if (rand < 0.7) return 'train';      // 70% for training
    if (rand < 0.85) return 'validation'; // 15% for validation
    return 'test';                        // 15% for testing
  }

  async getUserContributions(userId: string): Promise<Contribution[]> {
    return Array.from(this.contributions.values()).filter(c => c.userId === userId);
  }

  async getContributionStats(userId: string): Promise<{ total: number; verified: number }> {
    const userContributions = Array.from(this.contributions.values()).filter(c => c.userId === userId);
    const verified = userContributions.filter(c => c.verified === true).length;
    return { 
      total: userContributions.length, 
      verified 
    };
  }

  // Training data export methods for AI model development
  async exportTrainingData(dataset?: string): Promise<Contribution[]> {
    const allContributions = Array.from(this.contributions.values());
    
    if (dataset && dataset !== 'all') {
      return allContributions.filter(c => c.trainingSet === dataset);
    }
    
    console.log(`Exporting training data for dataset: ${dataset || 'all'} - ${allContributions.length} contributions`);
    return allContributions;
  }

  async getTrainingDataStats(): Promise<{
    total: number;
    verified: number;
    byEquipment: Record<string, number>;
    byDataset: Record<string, number>;
  }> {
    const allContributions = Array.from(this.contributions.values());
    const verified = allContributions.filter(c => c.verified === true).length;
    
    const byEquipment: Record<string, number> = {};
    const byDataset: Record<string, number> = { train: 0, validation: 0, test: 0 };
    
    allContributions.forEach(c => {
      byEquipment[c.equipment] = (byEquipment[c.equipment] || 0) + 1;
      if (c.trainingSet) {
        byDataset[c.trainingSet] = (byDataset[c.trainingSet] || 0) + 1;
      }
    });
    
    return {
      total: allContributions.length,
      verified,
      byEquipment,
      byDataset
    };
  }
}

export const storage = new AirtableStorage();
