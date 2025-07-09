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

export const insertWorkoutSessionSchema = createInsertSchema(workoutSessions).omit({
  id: true,
});

export const insertExercisePairingSchema = createInsertSchema(exercisePairings).omit({
  id: true,
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

export type Exercise = typeof exercises.$inferSelect;
export type InsertExercise = z.infer<typeof insertExerciseSchema>;
export type WorkoutSession = typeof workoutSessions.$inferSelect;
export type InsertWorkoutSession = z.infer<typeof insertWorkoutSessionSchema>;
export type ExercisePairing = typeof exercisePairings.$inferSelect;
export type InsertExercisePairing = z.infer<typeof insertExercisePairingSchema>;
export type Contribution = typeof contributions.$inferSelect;
export type InsertContribution = z.infer<typeof insertContributionSchema>;
