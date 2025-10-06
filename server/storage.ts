import { 
  exercises, 
  workoutSessions, 
  exercisePairings,
  users,
  contributions,
  superSets,
  workouts,
  workoutSuperSets,
  workoutSessionsNew,
  setLogs,
  coachingSessions,
  workoutTemplates,
  workoutSections,
  workoutExercises,
  blocks,
  blockExercises,
  blockWorkouts,
  blockWorkoutSessions,
  type Exercise, 
  type InsertExercise,
  type WorkoutSession,
  type InsertWorkoutSession,
  type ExercisePairing,
  type InsertExercisePairing,
  type User,
  type UpsertUser,
  type Contribution,
  type InsertContribution,
  type SuperSet,
  type InsertSuperSet,
  type Workout,
  type InsertWorkout,
  type WorkoutSuperSet,
  type InsertWorkoutSuperSet,
  type WorkoutSessionNew,
  type InsertWorkoutSessionNew,
  type SetLog,
  type InsertSetLog,
  type CoachingSession,
  type InsertCoachingSession,
  type WorkoutTemplate,
  type InsertWorkoutTemplate,
  type WorkoutSection,
  type InsertWorkoutSection,
  type WorkoutExercise,
  type InsertWorkoutExercise,
  type Block,
  type InsertBlock,
  type BlockExercise,
  type InsertBlockExercise,
  type BlockWorkout
} from "@shared/schema";
import { airtableService } from "./airtable";
import { db } from "./db";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { compileBlockToTimeline, type ExecutionTimeline, type TimelineStep } from "./timeline-compiler";

export interface IStorage {
  // Exercise methods
  getExercise(id: number): Promise<Exercise | undefined>;
  getAllExercises(): Promise<Exercise[]>;
  getExercisesByCategory(category: string): Promise<Exercise[]>;
  getExercisesByExerciseType(exerciseType: string): Promise<Exercise[]>;
  getExercisesByEquipment(equipment: string): Promise<Exercise[]>;
  searchExercises(query: string): Promise<Exercise[]>;
  createExercise(exercise: InsertExercise): Promise<Exercise>;

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
  checkDuplicateImage(imageHash: string): Promise<boolean>;
  updateContributionLabel(id: string, equipment: string): Promise<Contribution>;

  // Super Sets methods
  createSuperSet(superSet: InsertSuperSet): Promise<SuperSet>;
  getUserSuperSets(userId: string): Promise<SuperSet[]>;
  getSuperSet(id: number): Promise<SuperSet | undefined>;
  updateSuperSet(id: number, updates: Partial<InsertSuperSet>): Promise<SuperSet>;
  deleteSuperSet(id: number): Promise<void>;

  // Workout methods
  createWorkout(workout: InsertWorkout): Promise<Workout>;
  getUserWorkouts(userId: string): Promise<Workout[]>;
  getWorkout(id: number): Promise<Workout | undefined>;
  updateWorkout(id: number, updates: Partial<InsertWorkout>): Promise<Workout>;
  deleteWorkout(id: number): Promise<void>;
  getWorkoutWithSuperSets(id: number): Promise<Workout & { superSets: SuperSet[] } | undefined>;

  // Workout Session methods
  startWorkoutSession(session: InsertWorkoutSessionNew): Promise<WorkoutSessionNew>;
  getActiveWorkoutSession(userId: string): Promise<any>;
  updateWorkoutSession(id: number, updates: Partial<InsertWorkoutSessionNew>): Promise<WorkoutSessionNew>;
  completeWorkoutSession(id: number, notes?: string): Promise<WorkoutSessionNew>;

  // Set Logging methods
  logSet(setLog: InsertSetLog): Promise<SetLog>;
  getSessionSetLogs(sessionId: number): Promise<SetLog[]>;

  // Coaching methods
  createCoachingSession(coaching: InsertCoachingSession): Promise<CoachingSession>;
  updateCoachingSession(id: number, updates: Partial<InsertCoachingSession>): Promise<CoachingSession>;
  getCoachingSession(sessionId: number): Promise<CoachingSession | undefined>;
  
  // Pre-built Workout Template methods
  createWorkoutTemplate(template: InsertWorkoutTemplate): Promise<WorkoutTemplate>;
  getWorkoutTemplates(filter?: { workoutType?: string; category?: string; difficulty?: number }): Promise<WorkoutTemplate[]>;
  getWorkoutTemplate(id: number): Promise<WorkoutTemplate | undefined>;
  getWorkoutTemplateWithSections(id: number): Promise<WorkoutTemplate & { sections: (WorkoutSection & { exercises: (WorkoutExercise & { exercise: Exercise })[] })[] } | undefined>;
  
  createWorkoutSection(section: InsertWorkoutSection): Promise<WorkoutSection>;
  getWorkoutSections(workoutTemplateId: number): Promise<WorkoutSection[]>;
  
  createWorkoutExercise(exercise: InsertWorkoutExercise): Promise<WorkoutExercise>;
  getWorkoutExercises(workoutSectionId: number): Promise<(WorkoutExercise & { exercise: Exercise })[]>;
  
  // Training data export methods
  exportTrainingData(dataset?: string): Promise<Contribution[]>;
  getTrainingDataStats(): Promise<{
    total: number;
    verified: number;
    byEquipment: Record<string, number>;
    byDataset: Record<string, number>;
  }>;
  
  // Block Workout methods
  createBlockWorkout(data: {
    name: string;
    description?: string;
    blocks: Array<{
      id: string;
      name: string;
      description: string;
      params: any;
      exercises: number[];
    }>;
    createdBy: string;
  }): Promise<BlockWorkout>;
  getBlockWorkouts(): Promise<BlockWorkout[]>;
  getBlockWorkout(id: number): Promise<BlockWorkout | undefined>;
  
  // Block Workout Session methods
  startBlockWorkoutSession(userId: string, workoutId: number): Promise<any>;
  getActiveBlockWorkoutSession(userId: string): Promise<any>;
}

export class DatabaseStorage implements IStorage {
  private exerciseCache: Map<number, Exercise> = new Map();
  private exerciseOrder: Exercise[] = []; // Preserve original order from Airtable
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

  async getExercisePairings(exerciseAId: number): Promise<ExercisePairing[]> {
    return await db
      .select()
      .from(exercisePairings)
      .where(eq(exercisePairings.exerciseAId, exerciseAId));
  }

  async createExercisePairing(insertPairing: InsertExercisePairing): Promise<ExercisePairing> {
    const [pairing] = await db.insert(exercisePairings).values(insertPairing).returning();
    return pairing;
  }

  // User methods for Replit Auth
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          email: userData.email,
          firstName: userData.firstName,
          lastName: userData.lastName,
          profileImageUrl: userData.profileImageUrl,
          updatedAt: new Date(),
          // NOTE: isAdmin is intentionally excluded to preserve admin status
        },
      })
      .returning();
    return user;
  }

  async setUserAdminStatus(userId: string, isAdmin: boolean): Promise<void> {
    await db
      .update(users)
      .set({ isAdmin, updatedAt: new Date() })
      .where(eq(users.id, userId));
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
    
    const contributionData = {
      ...insertContribution,
      id,
      verified: false,
      votes: 0,
      tags: equipmentTags,
      imageHash: this.generateImageHash(imageData),
      imageSize,
      imageWidth,
      imageHeight,
      moderationStatus: 'pending' as const,
      trainingSet: this.assignTrainingSet(), // Auto-assign to train/validation/test
    };

    // Store in database
    const [contribution] = await db
      .insert(contributions)
      .values(contributionData)
      .returning();

    console.log('New contribution created in database:', {
      id: contribution.id,
      userId: contribution.userId,
      equipment: contribution.equipment,
      confidence: contribution.confidence,
      trainingSet: contribution.trainingSet,
      tags: contribution.tags,
      imageSize: contribution.imageSize
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
    return await db
      .select()
      .from(contributions)
      .where(eq(contributions.userId, userId))
      .orderBy(desc(contributions.createdAt));
  }

  async getContributionStats(userId: string): Promise<{ total: number; verified: number }> {
    const userContributions = await this.getUserContributions(userId);
    const verified = userContributions.filter(c => c.verified === true).length;
    return { 
      total: userContributions.length, 
      verified 
    };
  }

  // Training data export methods for AI model development
  async exportTrainingData(dataset?: string): Promise<Contribution[]> {
    let query = db.select().from(contributions);
    
    if (dataset && dataset !== 'all') {
      query = query.where(eq(contributions.trainingSet, dataset as any));
    }
    
    const allContributions = await query;
    console.log(`Exporting training data for dataset: ${dataset || 'all'} - ${allContributions.length} contributions`);
    return allContributions;
  }

  async getTrainingDataStats(): Promise<{
    total: number;
    verified: number;
    byEquipment: Record<string, number>;
    byDataset: Record<string, number>;
  }> {
    const allContributions = await db.select().from(contributions);
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

  async checkDuplicateImage(imageHash: string): Promise<boolean> {
    const [result] = await db.select()
      .from(contributions)
      .where(eq(contributions.imageHash, imageHash))
      .limit(1);
    
    return !!result;
  }

  async updateContributionLabel(id: string, equipment: string): Promise<Contribution> {
    const [updated] = await db
      .update(contributions)
      .set({ 
        equipment,
        tags: this.generateEquipmentTags(equipment) // Update tags based on new equipment
      })
      .where(eq(contributions.id, id))
      .returning();
    
    if (!updated) {
      throw new Error('Contribution not found');
    }
    
    return updated;
  }

  async deleteContribution(contributionId: string, userId: string): Promise<boolean> {
    try {
      const result = await db
        .delete(contributions)
        .where(and(eq(contributions.id, contributionId), eq(contributions.userId, userId)))
        .returning();
      
      return result.length > 0;
    } catch (error) {
      console.error("Error deleting contribution:", error);
      return false;
    }
  }

  // Trainer pairs management methods
  async getTrainerApprovedPairs(): Promise<any[]> {
    const results = await db
      .select({
        id: exercisePairings.id,
        exerciseAId: exercisePairings.exerciseAId,
        exerciseBId: exercisePairings.exerciseBId,
        compatibilityScore: exercisePairings.compatibilityScore,
        reasoning: exercisePairings.reasoning,
        trainerApproved: exercisePairings.trainerApproved,
        pairingType: exercisePairings.pairingType,
        notes: exercisePairings.notes,
        approvedBy: exercisePairings.approvedBy,
        createdAt: exercisePairings.createdAt,
        updatedAt: exercisePairings.updatedAt,
      })
      .from(exercisePairings)
      .orderBy(desc(exercisePairings.createdAt));
    
    // Get exercise details for each pairing
    const pairingsWithExercises = await Promise.all(
      results.map(async (pairing) => {
        const exerciseA = await this.getExercise(pairing.exerciseAId);
        const exerciseB = await this.getExercise(pairing.exerciseBId);
        
        return {
          ...pairing,
          exerciseA,
          exerciseB
        };
      })
    );
    
    return pairingsWithExercises;
  }

  async createTrainerPairing(pairingData: {
    exerciseAId: number;
    exerciseBId: number;
    pairingType: string;
    notes?: string;
    trainerApproved: boolean;
    approvedBy: string;
  }): Promise<any> {
    // Calculate compatibility score based on exercises
    const exerciseA = await this.getExercise(pairingData.exerciseAId);
    const exerciseB = await this.getExercise(pairingData.exerciseBId);
    
    if (!exerciseA || !exerciseB) {
      throw new Error("Invalid exercise IDs");
    }
    
    const compatibilityScore = this.calculateCompatibilityScore(exerciseA, exerciseB);
    const reasoning = this.generatePairingReasoning(exerciseA, exerciseB);
    
    const [pairing] = await db
      .insert(exercisePairings)
      .values({
        ...pairingData,
        compatibilityScore,
        reasoning
      })
      .returning();
    
    return pairing;
  }

  async updateTrainerPairing(pairingId: number, updates: any): Promise<any> {
    const [pairing] = await db
      .update(exercisePairings)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(exercisePairings.id, pairingId))
      .returning();
    
    return pairing;
  }

  async deleteTrainerPairing(pairingId: number): Promise<boolean> {
    try {
      const result = await db
        .delete(exercisePairings)
        .where(eq(exercisePairings.id, pairingId))
        .returning();
      
      return result.length > 0;
    } catch (error) {
      console.error("Error deleting trainer pairing:", error);
      return false;
    }
  }

  private calculateCompatibilityScore(exerciseA: Exercise, exerciseB: Exercise): number {
    let score = 50; // Base score
    
    // Opposing movement patterns get higher score
    if (this.isOpposingMovementPattern(exerciseA.movementPattern, exerciseB.movementPattern)) {
      score += 30;
    }
    
    // Same equipment gets bonus for efficiency
    if (exerciseA.equipment === exerciseB.equipment) {
      score += 15;
    }
    
    // Different muscle groups get bonus
    if (!this.hasMuscleOverlap(exerciseA.primaryMuscleGroup, exerciseB.primaryMuscleGroup)) {
      score += 15;
    }
    
    return Math.min(score, 100);
  }

  private generatePairingReasoning(exerciseA: Exercise, exerciseB: Exercise): string[] {
    const reasons = [];
    
    if (this.isOpposingMovementPattern(exerciseA.movementPattern, exerciseB.movementPattern)) {
      reasons.push("Opposing movement patterns for balanced training");
    }
    
    if (exerciseA.equipment === exerciseB.equipment) {
      reasons.push("Same equipment for efficient transitions");
    }
    
    if (!this.hasMuscleOverlap(exerciseA.primaryMuscleGroup, exerciseB.primaryMuscleGroup)) {
      reasons.push("Different muscle groups allow for active recovery");
    }
    
    return reasons;
  }

  private isOpposingMovementPattern(patternA: string, patternB: string): boolean {
    const opposingPairs = [
      ["push", "pull"],
      ["squat", "hinge"],
      ["horizontal", "vertical"]
    ];
    
    return opposingPairs.some(pair => 
      (patternA.includes(pair[0]) && patternB.includes(pair[1])) ||
      (patternA.includes(pair[1]) && patternB.includes(pair[0]))
    );
  }

  private hasMuscleOverlap(muscleA: string, muscleB: string): boolean {
    return muscleA.toLowerCase() === muscleB.toLowerCase();
  }

  async getTrainerApprovedPairingsByExercise(exerciseId: number): Promise<any[]> {
    const results = await db
      .select()
      .from(exercisePairings)
      .where(and(
        eq(exercisePairings.exerciseAId, exerciseId), 
        eq(exercisePairings.trainerApproved, true)
      ));
    
    return results;
  }

  // Super Sets implementation
  async createSuperSet(superSetData: InsertSuperSet): Promise<SuperSet> {
    const [superSet] = await db
      .insert(superSets)
      .values(superSetData)
      .returning();
    
    return superSet;
  }

  async getUserSuperSets(userId: string): Promise<SuperSet[]> {
    return await db
      .select()
      .from(superSets)
      .where(eq(superSets.userId, userId))
      .orderBy(desc(superSets.createdAt));
  }

  async getSuperSet(id: number): Promise<SuperSet | undefined> {
    const [superSet] = await db
      .select()
      .from(superSets)
      .where(eq(superSets.id, id))
      .limit(1);
    
    return superSet;
  }

  async updateSuperSet(id: number, updates: Partial<InsertSuperSet>): Promise<SuperSet> {
    const [superSet] = await db
      .update(superSets)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(superSets.id, id))
      .returning();
    
    return superSet;
  }

  async deleteSuperSet(id: number): Promise<void> {
    await db.delete(superSets).where(eq(superSets.id, id));
  }

  // Workout implementation
  async createWorkout(workoutData: InsertWorkout): Promise<Workout> {
    const [workout] = await db
      .insert(workouts)
      .values(workoutData)
      .returning();
    
    return workout;
  }

  async getUserWorkouts(userId: string): Promise<Workout[]> {
    return await db
      .select()
      .from(workouts)
      .where(eq(workouts.userId, userId))
      .orderBy(desc(workouts.createdAt));
  }

  async getWorkout(id: number): Promise<Workout | undefined> {
    const [workout] = await db
      .select()
      .from(workouts)
      .where(eq(workouts.id, id))
      .limit(1);
    
    return workout;
  }

  async updateWorkout(id: number, updates: Partial<InsertWorkout>): Promise<Workout> {
    const [workout] = await db
      .update(workouts)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(workouts.id, id))
      .returning();
    
    return workout;
  }

  async deleteWorkout(id: number): Promise<void> {
    await db.delete(workouts).where(eq(workouts.id, id));
  }

  async getWorkoutWithSuperSets(id: number): Promise<Workout & { superSets: SuperSet[] } | undefined> {
    const workout = await this.getWorkout(id);
    if (!workout) return undefined;

    // Get super sets associated with this workout
    const workoutSuperSetJoins = await db
      .select()
      .from(workoutSuperSets)
      .where(eq(workoutSuperSets.workoutId, id))
      .orderBy(workoutSuperSets.orderIndex);

    const superSetIds = workoutSuperSetJoins.map(ws => ws.superSetId);
    const associatedSuperSets = superSetIds.length > 0 
      ? await db.select().from(superSets).where(inArray(superSets.id, superSetIds))
      : [];

    return {
      ...workout,
      superSets: associatedSuperSets
    };
  }

  // Workout Session implementation
  async startWorkoutSession(sessionData: InsertWorkoutSessionNew): Promise<WorkoutSessionNew> {
    const [session] = await db
      .insert(workoutSessionsNew)
      .values(sessionData)
      .returning();
    
    return session;
  }

  async getActiveWorkoutSession(userId: string): Promise<any> {
    const [session] = await db
      .select()
      .from(workoutSessionsNew)
      .where(and(
        eq(workoutSessionsNew.userId, userId),
        eq(workoutSessionsNew.status, "active")
      ))
      .orderBy(desc(workoutSessionsNew.id))
      .limit(1);
    
    if (!session) {
      return undefined;
    }

    // If session has a workout template, fetch it with exercises
    if (session.workoutTemplateId) {
      const template = await this.getWorkoutTemplateWithSections(session.workoutTemplateId);
      return {
        ...session,
        workoutTemplate: template
      };
    }
    
    return session;
  }

  async updateWorkoutSession(id: number, updates: Partial<InsertWorkoutSessionNew>): Promise<WorkoutSessionNew> {
    const [session] = await db
      .update(workoutSessionsNew)
      .set(updates)
      .where(eq(workoutSessionsNew.id, id))
      .returning();
    
    return session;
  }

  async completeWorkoutSession(id: number, notes?: string): Promise<WorkoutSessionNew> {
    const completedAt = new Date();
    const session = await db
      .select()
      .from(workoutSessionsNew)
      .where(eq(workoutSessionsNew.id, id))
      .limit(1);

    if (!session[0]) throw new Error("Session not found");

    const totalDuration = Math.floor((completedAt.getTime() - new Date(session[0].startedAt).getTime()) / 1000);

    const [updatedSession] = await db
      .update(workoutSessionsNew)
      .set({
        status: "completed",
        completedAt,
        totalDuration,
        notes
      })
      .where(eq(workoutSessionsNew.id, id))
      .returning();
    
    return updatedSession;
  }

  // Set Logging implementation
  async logSet(setLogData: InsertSetLog): Promise<SetLog> {
    const [setLog] = await db
      .insert(setLogs)
      .values(setLogData)
      .returning();
    
    return setLog;
  }

  async getSessionSetLogs(sessionId: number): Promise<SetLog[]> {
    return await db
      .select()
      .from(setLogs)
      .where(eq(setLogs.sessionId, sessionId))
      .orderBy(setLogs.completedAt);
  }

  // Coaching implementation
  async createCoachingSession(coachingData: InsertCoachingSession): Promise<CoachingSession> {
    const [coaching] = await db
      .insert(coachingSessions)
      .values(coachingData)
      .returning();
    
    return coaching;
  }

  async updateCoachingSession(id: number, updates: Partial<InsertCoachingSession>): Promise<CoachingSession> {
    const [coaching] = await db
      .update(coachingSessions)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(coachingSessions.id, id))
      .returning();
    
    return coaching;
  }

  async getCoachingSession(sessionId: number): Promise<CoachingSession | undefined> {
    const [coaching] = await db
      .select()
      .from(coachingSessions)
      .where(eq(coachingSessions.sessionId, sessionId))
      .limit(1);
    
    return coaching;
  }

  // Pre-built Workout Template methods implementation
  async createWorkoutTemplate(template: InsertWorkoutTemplate): Promise<WorkoutTemplate> {
    const [workoutTemplate] = await db.insert(workoutTemplates).values(template).returning();
    return workoutTemplate;
  }

  async getWorkoutTemplates(filter?: { workoutType?: string; category?: string; difficulty?: number }): Promise<WorkoutTemplate[]> {
    let query = db.select().from(workoutTemplates).where(eq(workoutTemplates.isPublic, true));
    
    if (filter?.workoutType) {
      query = query.where(eq(workoutTemplates.workoutType, filter.workoutType));
    }
    if (filter?.category) {
      query = query.where(eq(workoutTemplates.category, filter.category));
    }
    if (filter?.difficulty) {
      query = query.where(eq(workoutTemplates.difficulty, filter.difficulty));
    }
    
    return await query.orderBy(workoutTemplates.name);
  }

  async getWorkoutTemplate(id: number): Promise<WorkoutTemplate | undefined> {
    const [template] = await db.select().from(workoutTemplates).where(eq(workoutTemplates.id, id));
    return template;
  }

  async getWorkoutTemplateWithSections(id: number): Promise<WorkoutTemplate & { sections: (WorkoutSection & { exercises: (WorkoutExercise & { exercise: Exercise })[] })[] } | undefined> {
    const template = await this.getWorkoutTemplate(id);
    if (!template) return undefined;

    const sections = await this.getWorkoutSections(id);
    const sectionsWithExercises = await Promise.all(
      sections.map(async (section) => ({
        ...section,
        exercises: await this.getWorkoutExercises(section.id)
      }))
    );

    return {
      ...template,
      sections: sectionsWithExercises
    };
  }

  async createWorkoutSection(section: InsertWorkoutSection): Promise<WorkoutSection> {
    const [workoutSection] = await db.insert(workoutSections).values(section).returning();
    return workoutSection;
  }

  async getWorkoutSections(workoutTemplateId: number): Promise<WorkoutSection[]> {
    return await db.select().from(workoutSections)
      .where(eq(workoutSections.workoutTemplateId, workoutTemplateId))
      .orderBy(workoutSections.orderIndex);
  }

  async createWorkoutExercise(exercise: InsertWorkoutExercise): Promise<WorkoutExercise> {
    const [workoutExercise] = await db.insert(workoutExercises).values(exercise).returning();
    return workoutExercise;
  }

  async getWorkoutExercises(workoutSectionId: number): Promise<(WorkoutExercise & { exercise: Exercise })[]> {
    // Refresh cache to ensure we have the latest exercises
    await this.refreshCache();
    
    const workoutExerciseRows = await db.select().from(workoutExercises)
      .where(eq(workoutExercises.workoutSectionId, workoutSectionId))
      .orderBy(workoutExercises.orderIndex);

    // Join with exercise data from cache
    return workoutExerciseRows.map(we => ({
      ...we,
      exercise: this.exerciseCache.get(we.exerciseId)!
    })).filter(we => we.exercise); // Filter out exercises that don't exist in cache
  }

  async createBlockWorkout(data: {
    name: string;
    description?: string;
    blocks: Array<{
      id: string;
      name: string;
      description: string;
      params: any;
      exercises: number[];
    }>;
    createdBy: string;
  }): Promise<BlockWorkout> {
    // Refresh cache to ensure we have latest exercise data
    await this.refreshCache();
    
    // Collect all unique exercise IDs
    const allExerciseIds = new Set<number>();
    data.blocks.forEach(block => {
      block.exercises.forEach(exId => allExerciseIds.add(exId));
    });

    // Validate all exercises exist
    const missingExercises = Array.from(allExerciseIds).filter(id => !this.exerciseCache.has(id));
    if (missingExercises.length > 0) {
      throw new Error(`Exercise IDs not found in Airtable: ${missingExercises.join(', ')}`);
    }

    // Create workout first
    const [workout] = await db.insert(blockWorkouts).values({
      name: data.name,
      description: data.description,
      createdBy: data.createdBy,
      blockSequence: [],
      estimatedDurationMin: 0
    }).returning();

    // Create blocks and exercises
    for (let i = 0; i < data.blocks.length; i++) {
      const blockData = data.blocks[i];
      
      // Create block
      const [block] = await db.insert(blocks).values({
        name: blockData.name,
        description: blockData.description,
        type: blockData.params.type || 'custom_sequence',
        params: blockData.params,
        createdBy: data.createdBy
      }).returning();

      // Create block exercises with snapshot data
      for (let j = 0; j < blockData.exercises.length; j++) {
        const exerciseId = blockData.exercises[j];
        const exercise = this.exerciseCache.get(exerciseId)!;
        
        await db.insert(blockExercises).values({
          blockId: block.id,
          exerciseId: exercise.id,
          orderIndex: j,
          exerciseName: exercise.name,
          primaryMuscleGroup: exercise.primaryMuscleGroup || undefined,
          movementPattern: exercise.movementPattern || undefined,
          equipmentPrimary: exercise.equipmentPrimary || exercise.equipment,
          equipmentSecondary: exercise.equipmentSecondary || [],
          coachingBulletPoints: exercise.coachingBulletPoints || undefined,
          videoUrl: exercise.videoUrl || undefined,
          imageUrl: exercise.imageUrl || undefined
        });
      }

      // Update workout's block sequence
      const updatedSequence = [
        ...(workout.blockSequence || []),
        { blockId: block.id, orderIndex: i }
      ];
      
      await db.update(blockWorkouts)
        .set({ blockSequence: updatedSequence })
        .where(eq(blockWorkouts.id, workout.id));
    }

    // Now compile the timeline from all blocks
    const allBlocks = await db.select().from(blocks)
      .where(inArray(blocks.id, workout.blockSequence.map(b => b.blockId)));
    
    // Fetch exercises for each block
    const blocksWithExercises = await Promise.all(
      allBlocks.map(async (block) => {
        const exercises = await db.select().from(blockExercises)
          .where(eq(blockExercises.blockId, block.id))
          .orderBy(blockExercises.orderIndex);
        return { ...block, exercises };
      })
    );

    // Sort blocks by workout sequence
    const sortedBlocks = workout.blockSequence
      .map(seq => blocksWithExercises.find(b => b.id === seq.blockId)!)
      .filter(Boolean);

    // Compile each block and combine into one timeline
    const allSteps: TimelineStep[] = [];
    let currentTimeMs = 0;
    let stepCounter = 1;

    for (let i = 0; i < sortedBlocks.length; i++) {
      const block = sortedBlocks[i];
      const isFirstBlock = i === 0;
      
      // Compile this block
      const blockTimeline = await compileBlockToTimeline(
        block,
        {
          workoutName: data.name,
          workoutStructure: "block_sequence",
          includeIntro: isFirstBlock
        }
      );

      // Add all steps from this block, adjusting timestamps
      for (const step of blockTimeline.executionTimeline) {
        allSteps.push({
          ...step,
          step: stepCounter++,
          atMs: currentTimeMs + step.atMs,
          endMs: currentTimeMs + step.endMs
        });
      }

      // Advance time to end of this block
      if (blockTimeline.executionTimeline.length > 0) {
        const lastStep = blockTimeline.executionTimeline[blockTimeline.executionTimeline.length - 1];
        currentTimeMs += lastStep.endMs;
      }
    }

    const totalDurationSec = Math.floor(currentTimeMs / 1000);

    // Validate compiled timeline
    if (allSteps.length === 0) {
      throw new Error("Failed to compile workout: no steps generated");
    }

    // Validate chronological order
    for (let i = 1; i < allSteps.length; i++) {
      if (allSteps[i].atMs < allSteps[i-1].endMs) {
        throw new Error(`Timeline validation failed: step ${i} overlaps with previous step`);
      }
    }

    // Create the complete execution timeline
    const executionTimeline: ExecutionTimeline = {
      workoutHeader: {
        name: data.name,
        totalDurationSec,
        structure: "block_sequence"
      },
      executionTimeline: allSteps,
      sync: {
        workoutStartEpochMs: 0, // Will be set when session starts
        resyncEveryMs: 15000,
        allowedDriftMs: 250
      }
    };

    // Update workout with compiled timeline and increment version
    await db.update(blockWorkouts)
      .set({ 
        executionTimeline,
        estimatedDurationMin: Math.ceil(totalDurationSec / 60),
        isPublished: true,
        publishedAt: new Date(),
        version: (workout.version || 0) + 1
      })
      .where(eq(blockWorkouts.id, workout.id));

    // Fetch the complete workout with timeline
    const [completeWorkout] = await db.select().from(blockWorkouts)
      .where(eq(blockWorkouts.id, workout.id));
    
    return completeWorkout;
  }

  async getBlockWorkouts(): Promise<BlockWorkout[]> {
    const workouts = await db.select().from(blockWorkouts)
      .where(eq(blockWorkouts.isPublished, true))
      .orderBy(desc(blockWorkouts.createdAt));
    return workouts;
  }

  async getBlockWorkout(id: number): Promise<BlockWorkout | undefined> {
    const [workout] = await db.select().from(blockWorkouts)
      .where(eq(blockWorkouts.id, id));
    return workout;
  }

  async startBlockWorkoutSession(userId: string, workoutId: number): Promise<any> {
    // Get the workout with its timeline
    const workout = await this.getBlockWorkout(workoutId);
    if (!workout) {
      throw new Error(`Workout ${workoutId} not found`);
    }
    if (!workout.executionTimeline) {
      throw new Error(`Workout ${workoutId} has no compiled timeline`);
    }

    // Create session with snapshot of timeline
    const [session] = await db.insert(blockWorkoutSessions).values({
      userId,
      blockWorkoutId: workoutId,
      status: 'active',
      snapshotTimeline: workout.executionTimeline,
      currentStepIndex: 0,
      startedAt: new Date()
    }).returning();

    return {
      ...session,
      blockWorkout: workout
    };
  }

  async getActiveBlockWorkoutSession(userId: string): Promise<any> {
    const [session] = await db.select().from(blockWorkoutSessions)
      .where(and(
        eq(blockWorkoutSessions.userId, userId),
        eq(blockWorkoutSessions.status, 'active')
      ))
      .orderBy(desc(blockWorkoutSessions.startedAt))
      .limit(1);

    if (!session) {
      return null;
    }

    // Get the workout data
    const workout = await this.getBlockWorkout(session.blockWorkoutId);

    return {
      ...session,
      blockWorkout: workout
    };
  }
}

export const storage = new DatabaseStorage();
