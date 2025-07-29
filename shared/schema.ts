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
  sessionId: integer("session_id").references(() => workoutSessionsNew.id).notNull(),
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
