import { pgTable, text, serial, integer, real, json, varchar, timestamp, jsonb, index, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const exercises = pgTable("exercises", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  
  // All 22 fields from your Airtable database
  alternativeNames: text("alternative_names"),
  primaryMuscleGroup: text("primary_muscle_group"),
  secondaryMuscleGroup: text("secondary_muscle_group").array().notNull().default([]),
  equipment: text("equipment").notNull(),
  equipmentPrimary: text("equipment_primary"),
  equipmentSecondary: text("equipment_secondary").array().notNull().default([]),
  equipmentType: text("equipment_type").array().notNull().default([]),
  difficultyLevel: text("difficulty_level"),
  exerciseType: text("exercise_type"), // Push, Pull, etc.
  exerciseCategory: text("exercise_category").array().notNull().default([]), // Hypertrophy, etc.
  pairingCompatibility: text("pairing_compatibility").array().notNull().default([]), // Pull, Core, etc.
  coachingBulletPoints: text("coaching_bullet_points"),
  commonMistakes: text("common_mistakes"),
  exerciseVariations: text("exercise_variations"),
  contraindications: text("contraindications"),
  exerciseTempo: text("exercise_tempo"),
  idealRepRange: text("ideal_rep_range"),
  restPeriodSec: integer("rest_period_sec"),
  estimatedTimePerSetSec: integer("estimated_time_per_set_sec"),
  tags: text("tags").array().notNull().default([]),
  anchorType: text("anchor_type"), // Anchored, Mobile
  bestPairedWith: text("best_paired_with").array().notNull().default([]),
  equipmentZone: text("equipment_zone"),
  setupTime: text("setup_time"), // Low, Medium, High
  
  // Media fields (for future video/image integration)
  videoUrl: text("video_url"),
  imageUrl: text("image_url"),
  
  // Legacy fields for backward compatibility
  category: text("category").notNull().default("general"),
  primaryMuscles: text("primary_muscles").array().notNull().default([]),
  secondaryMuscles: text("secondary_muscles").array().notNull().default([]),
  movementPattern: text("movement_pattern").notNull().default("general"),
  difficulty: integer("difficulty").notNull().default(1),
  instructions: json("instructions").$type<{
    setup: string;
    execution: string[];
    safetyTips: string[];
  }>().notNull(),
  coachingTips: text("coaching_tips").array().notNull().default([]),
  mistakes: text("mistakes").array().notNull().default([]),
  variations: text("variations").array().notNull().default([]),
});

export const workoutSessions = pgTable("workout_sessions", {
  id: serial("id").primaryKey(),
  exerciseAId: integer("exercise_a_id").references(() => exercises.id).notNull(),
  exerciseBId: integer("exercise_b_id").references(() => exercises.id).notNull(),
  sets: integer("sets").notNull(),
  completedSets: integer("completed_sets").notNull().default(0),
  restTime: integer("rest_time").notNull().default(150), // seconds
  startedAt: text("started_at").notNull(),
});

export const exercisePairings = pgTable("exercise_pairings", {
  id: serial("id").primaryKey(),
  exerciseAId: integer("exercise_a_id").references(() => exercises.id).notNull(),
  exerciseBId: integer("exercise_b_id").references(() => exercises.id).notNull(),
  compatibilityScore: real("compatibility_score").notNull(),
  reasoning: text("reasoning").array().notNull(),
  trainerApproved: boolean("trainer_approved").notNull().default(false),
  approvedBy: varchar("approved_by").references(() => users.id),
  pairingType: varchar("pairing_type", { length: 50 }), // "push_pull", "squat_hinge", "compound_isolation"
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertExerciseSchema = createInsertSchema(exercises).omit({
  id: true,
});

export const insertLegacyWorkoutSessionSchema = createInsertSchema(workoutSessions).omit({
  id: true,
});

export const insertExercisePairingSchema = createInsertSchema(exercisePairings).omit({
  id: true,
});

// Super Sets - Saved exercise combinations
export const superSets = pgTable("super_sets", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  exerciseAId: integer("exercise_a_id").references(() => exercises.id).notNull(),
  exerciseBId: integer("exercise_b_id").references(() => exercises.id).notNull(),
  defaultSets: integer("default_sets").notNull().default(3),
  defaultRestTime: integer("default_rest_time").notNull().default(150), // seconds
  difficulty: integer("difficulty").notNull().default(3), // 1-5 scale
  tags: text("tags").array().notNull().default([]),
  isPublic: boolean("is_public").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Workouts - Collections of super sets
export const workouts = pgTable("workouts", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  estimatedDuration: integer("estimated_duration"), // minutes
  difficulty: integer("difficulty").notNull().default(3), // 1-5 scale
  muscleGroups: text("muscle_groups").array().notNull().default([]),
  tags: text("tags").array().notNull().default([]),
  isTemplate: boolean("is_template").notNull().default(false),
  isPublic: boolean("is_public").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Workout Super Sets - Join table for workouts and super sets
export const workoutSuperSets = pgTable("workout_super_sets", {
  id: serial("id").primaryKey(),
  workoutId: integer("workout_id").references(() => workouts.id).notNull(),
  superSetId: integer("super_set_id").references(() => superSets.id).notNull(),
  orderIndex: integer("order_index").notNull(),
  customSets: integer("custom_sets"), // Override default sets
  customRestTime: integer("custom_rest_time"), // Override default rest time
});

// Workout Sessions - Active workout tracking
export const workoutSessionsNew = pgTable("workout_sessions_new", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull(),
  workoutId: integer("workout_id").references(() => workouts.id),
  workoutTemplateId: integer("workout_template_id").references(() => workoutTemplates.id),
  status: text("status").notNull().default("active"), // active, completed, paused
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  totalDuration: integer("total_duration"), // seconds
  notes: text("notes"),
});

// Set Logs - Individual set tracking within sessions
export const setLogs = pgTable("set_logs", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => workoutSessionsNew.id).notNull(),
  superSetId: integer("super_set_id").references(() => superSets.id).notNull(),
  exerciseId: integer("exercise_id").references(() => exercises.id).notNull(),
  setNumber: integer("set_number").notNull(),
  reps: integer("reps"),
  weight: real("weight"),
  restTime: integer("rest_time"), // actual rest time taken
  completedAt: timestamp("completed_at").defaultNow(),
  notes: text("notes"),
});

// Coaching Sessions - LLM interaction tracking
export const coachingSessions = pgTable("coaching_sessions", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").references(() => workoutSessionsNew.id),
  blockWorkoutSessionId: integer("block_workout_session_id").references(() => blockWorkoutSessions.id),
  messages: jsonb("messages").$type<Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp: string;
    audioUrl?: string;
  }>>().notNull().default([]),
  voiceEnabled: boolean("voice_enabled").notNull().default(false),
  preferredStyle: text("preferred_style").notNull().default("motivational"), // motivational, technical, casual
  currentExercise: integer("current_exercise").references(() => exercises.id),
  currentSet: integer("current_set").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Pre-built Workout Templates - Support traditional strength & timed cross-training
export const workoutTemplates = pgTable("workout_templates", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  workoutType: text("workout_type").notNull(), // "strength", "cross_training", "hybrid"
  category: text("category").notNull(), // "push_pull_legs", "upper_lower", "amrap", "emom", "tabata"
  difficulty: integer("difficulty").notNull().default(3), // 1-5 scale
  estimatedDuration: integer("estimated_duration").notNull(), // minutes
  muscleGroups: text("muscle_groups").array().notNull().default([]),
  equipmentNeeded: text("equipment_needed").array().notNull().default([]),
  tags: text("tags").array().notNull().default([]),
  isPublic: boolean("is_public").notNull().default(true),
  createdBy: varchar("created_by"),
  timingStructure: text("timing_structure").notNull(), // "traditional", "amrap", "emom", "tabata", "circuit"
  totalRounds: integer("total_rounds"), // For AMRAP/circuit workouts
  workDuration: integer("work_duration"), // seconds - for timed workouts
  restDuration: integer("rest_duration"), // seconds - for timed workouts
  instructions: text("instructions"), // Special instructions for the workout
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Workout Sections - Different phases of a workout (warmup, main work, cooldown)
export const workoutSections = pgTable("workout_sections", {
  id: serial("id").primaryKey(),
  workoutTemplateId: integer("workout_template_id").references(() => workoutTemplates.id).notNull(),
  name: text("name").notNull(), // "Warm-up", "Main Work", "Cooldown"
  orderIndex: integer("order_index").notNull(),
  sectionType: text("section_type").notNull(), // "warmup", "main", "cooldown", "finisher"
  duration: integer("duration"), // minutes - for timed sections
  rounds: integer("rounds"), // For multi-round sections
  restBetweenRounds: integer("rest_between_rounds"), // seconds
  instructions: text("instructions"),
});

// Workout Exercises - Flexible exercise structure for all workout types
export const workoutExercises = pgTable("workout_exercises", {
  id: serial("id").primaryKey(),
  workoutSectionId: integer("workout_section_id").references(() => workoutSections.id).notNull(),
  exerciseId: integer("exercise_id").notNull(), // References Airtable exercise ID
  orderIndex: integer("order_index").notNull(),
  
  // Traditional strength training fields
  sets: integer("sets"),
  reps: text("reps"), // Can be "8-12", "AMRAP", "Max", etc.
  weight: text("weight"), // "Bodyweight", "50% 1RM", "RPE 8", etc.
  restSeconds: integer("rest_seconds"),
  
  // Timed workout fields  
  workSeconds: integer("work_seconds"), // For EMOM, Tabata, etc.
  restAfterExercise: integer("rest_after_exercise"), // seconds
  targetReps: integer("target_reps"), // For EMOM/timed workouts
  
  // Flexible instructions
  notes: text("notes"), // Special instructions for this exercise
  modification: text("modification"), // Easier/harder variations
  
  // AI Coach Context - Snapshot of exercise data from Airtable at workout creation
  primaryMuscleGroup: text("primary_muscle_group"),
  movementPattern: text("movement_pattern"),
  equipmentPrimary: text("equipment_primary"),
  equipmentSecondary: text("equipment_secondary").array().notNull().default([]),
  coachingBulletPoints: text("coaching_bullet_points"),
});

// Insert schemas for new tables
export const insertSuperSetSchema = createInsertSchema(superSets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWorkoutSchema = createInsertSchema(workouts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWorkoutSuperSetSchema = createInsertSchema(workoutSuperSets).omit({
  id: true,
});

export const insertWorkoutSessionNewSchema = createInsertSchema(workoutSessionsNew).omit({
  id: true,
});

export const insertSetLogSchema = createInsertSchema(setLogs).omit({
  id: true,
  completedAt: true,
});

export const insertWorkoutTemplateSchema = createInsertSchema(workoutTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWorkoutSectionSchema = createInsertSchema(workoutSections).omit({
  id: true,
});

export const insertWorkoutExerciseSchema = createInsertSchema(workoutExercises).omit({
  id: true,
});

export const insertCoachingSessionSchema = createInsertSchema(coachingSessions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Session storage table for Replit Auth
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table for Replit Auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().notNull(),
  email: varchar("email").unique(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  isAdmin: boolean("is_admin").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Image contributions for community AI training - optimized for model training
export const contributions = pgTable("contributions", {
  id: varchar("id").primaryKey().notNull(),
  userId: varchar("user_id").notNull().references(() => users.id),
  imageData: text("image_data").notNull(), // base64 encoded image
  equipment: varchar("equipment").notNull(), // Primary label for training
  gymLocation: varchar("gym_location"),
  notes: text("notes"),
  confidence: real("confidence").notNull(),
  verified: boolean("verified").default(false),
  votes: integer("votes").default(0),
  tags: text("tags").array(),
  userTags: text("user_tags").array().notNull().default([]), // User-provided descriptive tags
  
  // AI Training specific fields
  imageHash: varchar("image_hash"), // For duplicate detection
  imageSize: integer("image_size"), // File size in bytes
  imageWidth: integer("image_width"), // Original image dimensions
  imageHeight: integer("image_height"),
  boundingBoxes: jsonb("bounding_boxes").$type<Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    label: string;
    confidence: number;
  }>>(), // Object detection annotations
  
  // Training dataset management
  trainingSet: varchar("training_set", { enum: ["train", "validation", "test"] }),
  lastTrainingRun: timestamp("last_training_run"),
  modelAccuracy: real("model_accuracy"), // Accuracy when used in training
  
  // Quality control
  moderationStatus: varchar("moderation_status", { enum: ["pending", "approved", "rejected"] }).default("pending"),
  moderatorId: varchar("moderator_id").references(() => users.id),
  moderationNotes: text("moderation_notes"),
  
  // Roboflow integration preparation
  roboflowId: varchar("roboflow_id"), // For Phase 3 Roboflow migration
  roboflowVersion: varchar("roboflow_version"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertContributionSchema = createInsertSchema(contributions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Coach Responses - AI workout coach dynamic response library
export const coachResponses = pgTable(
  "coach_responses",
  {
    id: serial("id").primaryKey(),
    eventType: varchar("event_type", { length: 32 }).notNull(), // 'work_preview' | 'work_start' | 'last5s' | 'halfway' | 'rest_start'
    pattern: varchar("pattern", { length: 24 }).notNull().default("any"), // 'superset' | 'straight_sets' | 'circuit' | 'any'
    mode: varchar("mode", { length: 24 }).notNull().default("any"), // 'time' | 'reps' | 'any'
    chatterLevel: varchar("chatter_level", { length: 16 }).notNull().default("minimal"), // 'silent'|'minimal'|'high'|'any'
    locale: varchar("locale", { length: 8 }).notNull().default("en-US"),
    textTemplate: text("text_template").notNull(), // supports tokens: {{exercise}}, {{next}}, {{restSec}}, {{cue}}, {{tempoCue}}
    priority: integer("priority").notNull().default(0),
    cooldownSec: integer("cooldown_sec").notNull().default(0),
    active: boolean("active").notNull().default(true),
    usageCount: integer("usage_count").notNull().default(0),
    lastUsedAt: timestamp("last_used_at", { withTimezone: false }),
    updatedAt: timestamp("updated_at", { withTimezone: false }).defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: false }).defaultNow(),
  },
  (t) => ({
    byDims: index("coach_responses_dims_idx").on(
      t.eventType, t.pattern, t.mode, t.chatterLevel, t.locale, t.active
    ),
  })
);

export const insertCoachResponseSchema = createInsertSchema(coachResponses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CoachResponse = typeof coachResponses.$inferSelect;
export type InsertCoachResponse = z.infer<typeof insertCoachResponseSchema>;

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// Core exercise system types
export type InsertExercise = z.infer<typeof insertExerciseSchema>;
export type Exercise = typeof exercises.$inferSelect;
export type InsertWorkoutSession = z.infer<typeof insertLegacyWorkoutSessionSchema>;
export type WorkoutSession = typeof workoutSessions.$inferSelect;
export type InsertExercisePairing = z.infer<typeof insertExercisePairingSchema>;
export type ExercisePairing = typeof exercisePairings.$inferSelect;

// New workout system types
export type InsertSuperSet = z.infer<typeof insertSuperSetSchema>;
export type SuperSet = typeof superSets.$inferSelect;
export type InsertWorkout = z.infer<typeof insertWorkoutSchema>;
export type Workout = typeof workouts.$inferSelect;
export type InsertWorkoutSuperSet = z.infer<typeof insertWorkoutSuperSetSchema>;
export type WorkoutSuperSet = typeof workoutSuperSets.$inferSelect;
export type InsertWorkoutSessionNew = z.infer<typeof insertWorkoutSessionNewSchema>;
export type WorkoutSessionNew = typeof workoutSessionsNew.$inferSelect;
export type InsertSetLog = z.infer<typeof insertSetLogSchema>;
export type SetLog = typeof setLogs.$inferSelect;
export type InsertCoachingSession = z.infer<typeof insertCoachingSessionSchema>;
export type CoachingSession = typeof coachingSessions.$inferSelect;

export type Contribution = typeof contributions.$inferSelect;
export type InsertContribution = z.infer<typeof insertContributionSchema>;

// Pre-built workout template types
export type InsertWorkoutTemplate = z.infer<typeof insertWorkoutTemplateSchema>;
export type WorkoutTemplate = typeof workoutTemplates.$inferSelect;
export type InsertWorkoutSection = z.infer<typeof insertWorkoutSectionSchema>;
export type WorkoutSection = typeof workoutSections.$inferSelect;
export type InsertWorkoutExercise = z.infer<typeof insertWorkoutExerciseSchema>;
export type WorkoutExercise = typeof workoutExercises.$inferSelect;

// ============================================================================
// BLOCK-BASED WORKOUT SYSTEM (New Architecture)
// ============================================================================

// Blocks - Core building units with flexible parameter-based configuration
export const blocks = pgTable("blocks", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(), // "9-Min Strength Block", "Tabata Cardio", etc.
  description: text("description"),
  type: text("type").notNull(), // "custom_sequence", "transition", "amrap_loop", "emom_window", etc.
  
  // Flexible parameters (JSON) - defines the timing/structure
  params: jsonb("params").$type<{
    // Timing params
    setsPerExercise?: number;
    workSec?: number;
    restSec?: number;
    roundRestSec?: number; // Rest between circuit rounds (after all exercises)
    transitionSec?: number;
    durationSec?: number;
    targetReps?: string; // Reps (e.g., "12" or "10-12" range)
    
    // Advanced params
    awaitReadyBeforeStart?: boolean;
    postCardio?: {
      exercise: string;
      durationSec: number;
    };
    
    // EMOM/AMRAP specific
    minuteMarks?: number[];
    maxDuration?: number;
    
    // Any other custom params
    [key: string]: any;
  }>().notNull().default({}),
  
  // Block metadata
  category: text("category"), // "strength", "cardio", "mobility", "transition"
  difficulty: integer("difficulty").default(3), // 1-5 scale
  estimatedDurationSec: integer("estimated_duration_sec"),
  equipmentNeeded: text("equipment_needed").array().notNull().default([]),
  muscleGroups: text("muscle_groups").array().notNull().default([]),
  
  // Admin & versioning
  createdBy: varchar("created_by").references(() => users.id),
  isTemplate: boolean("is_template").notNull().default(false), // Reusable template vs one-off
  isPublic: boolean("is_public").notNull().default(false),
  version: integer("version").notNull().default(1),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Block Exercises - Exercises within a block
export const blockExercises = pgTable("block_exercises", {
  id: serial("id").primaryKey(),
  blockId: integer("block_id").references(() => blocks.id).notNull(),
  exerciseId: integer("exercise_id").notNull(), // References Airtable exercise ID
  orderIndex: integer("order_index").notNull(),
  
  // Exercise-specific overrides (optional)
  workSec: integer("work_sec"), // Override block-level timing
  restSec: integer("rest_sec"),
  targetReps: text("target_reps"), // Override block-level reps (e.g., "12-15", "10 each leg")
  notes: text("notes"),
  
  // Snapshot of exercise data from Airtable (for coach context)
  exerciseName: text("exercise_name").notNull(),
  primaryMuscleGroup: text("primary_muscle_group"),
  movementPattern: text("movement_pattern"),
  equipmentPrimary: text("equipment_primary"),
  equipmentSecondary: text("equipment_secondary").array().notNull().default([]),
  coachingBulletPoints: text("coaching_bullet_points"),
  videoUrl: text("video_url"), // For future video integration
  imageUrl: text("image_url"), // For future image integration
});

// Block Workouts - Collections of blocks in sequence
export const blockWorkouts = pgTable("block_workouts", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  
  // Workout metadata
  category: text("category"), // "strength", "hiit", "hybrid", "mobility"
  difficulty: integer("difficulty").notNull().default(3),
  estimatedDurationMin: integer("estimated_duration_min"),
  muscleGroups: text("muscle_groups").array().notNull().default([]),
  equipmentNeeded: text("equipment_needed").array().notNull().default([]),
  tags: text("tags").array().notNull().default([]),
  
  // Block sequence (array of block IDs in order)
  blockSequence: jsonb("block_sequence").$type<Array<{
    blockId: number;
    orderIndex: number;
  }>>().notNull().default([]),
  
  // Compiled execution timeline (snapshot at publish time)
  executionTimeline: jsonb("execution_timeline").$type<{
    workoutHeader: {
      name: string;
      totalDurationSec: number;
      structure: string;
    };
    executionTimeline: Array<{
      step: number;
      type: "instruction" | "work" | "rest" | "transition" | "await_ready" | "hold" | "amrap_loop" | "emom_window";
      text?: string;
      exercise?: {
        id: number;
        name: string;
        cues: string[];
        equipment: string[];
        muscleGroup: string;
        videoUrl?: string;
        imageUrl?: string;
      };
      atMs: number;
      endMs: number;
      durationSec?: number;
      set?: number;
      round?: number;
      label?: string;
      nextStepId?: string;
      coachPrompt?: string;
    }>;
    sync: {
      workoutStartEpochMs: number;
      resyncEveryMs: number;
      allowedDriftMs: number;
    };
  }>(),
  
  // Publishing & versioning
  isPublished: boolean("is_published").notNull().default(false),
  publishedAt: timestamp("published_at"),
  createdBy: varchar("created_by").references(() => users.id),
  isPublic: boolean("is_public").notNull().default(false),
  version: integer("version").notNull().default(1),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Block Workout Sessions - Tracks user sessions using block workouts
export const blockWorkoutSessions = pgTable("block_workout_sessions", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id),
  blockWorkoutId: integer("block_workout_id").references(() => blockWorkouts.id).notNull(),
  
  // Session state
  status: text("status").notNull().default("active"), // "active", "paused", "completed", "abandoned"
  currentStep: integer("current_step").notNull().default(0),
  
  // Timing & sync
  startedAt: timestamp("started_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  totalPauseDurationMs: integer("total_pause_duration_ms").notNull().default(0),
  lastSyncAt: timestamp("last_sync_at"),
  
  // Snapshot of execution timeline (immune to workout edits)
  executionTimelineSnapshot: jsonb("execution_timeline_snapshot").$type<{
    workoutHeader: {
      name: string;
      totalDurationSec: number;
      structure: string;
    };
    executionTimeline: Array<{
      step: number;
      type: string;
      text?: string;
      exercise?: any;
      atMs: number;
      endMs: number;
      [key: string]: any;
    }>;
    sync: {
      workoutStartEpochMs: number;
      resyncEveryMs: number;
      allowedDriftMs: number;
    };
  }>(),
  
  notes: text("notes"),
});

// Insert schemas for Block system
export const insertBlockSchema = createInsertSchema(blocks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBlockExerciseSchema = createInsertSchema(blockExercises).omit({
  id: true,
});

export const insertBlockWorkoutSchema = createInsertSchema(blockWorkouts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertBlockWorkoutSessionSchema = createInsertSchema(blockWorkoutSessions).omit({
  id: true,
});

// Types for Block system
export type InsertBlock = z.infer<typeof insertBlockSchema>;
export type Block = typeof blocks.$inferSelect;
export type InsertBlockExercise = z.infer<typeof insertBlockExerciseSchema>;
export type BlockExercise = typeof blockExercises.$inferSelect;
export type InsertBlockWorkout = z.infer<typeof insertBlockWorkoutSchema>;
export type BlockWorkout = typeof blockWorkouts.$inferSelect;
export type InsertBlockWorkoutSession = z.infer<typeof insertBlockWorkoutSessionSchema>;
export type BlockWorkoutSession = typeof blockWorkoutSessions.$inferSelect;
