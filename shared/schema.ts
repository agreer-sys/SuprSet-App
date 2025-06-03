import { pgTable, text, serial, integer, real, json } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const exercises = pgTable("exercises", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  category: text("category").notNull(), // push, pull, legs, core, compound
  equipment: text("equipment").notNull(), // barbell, dumbbell, bodyweight, machine, cable
  primaryMuscles: text("primary_muscles").array().notNull(),
  secondaryMuscles: text("secondary_muscles").array().notNull(),
  movementPattern: text("movement_pattern").notNull(), // horizontal_push, horizontal_pull, vertical_push, vertical_pull, squat, hinge, lunge, rotation
  difficulty: integer("difficulty").notNull(), // 1-5 scale
  instructions: json("instructions").$type<{
    setup: string;
    execution: string[];
    safetyTips: string[];
  }>().notNull(),
  // Airtable specific fields
  anchorType: text("anchor_type"), // Anchored, Mobile
  setupTime: text("setup_time"), // Low, Medium, High
  equipmentZone: text("equipment_zone"), // zone identifier
  bestPairedWith: text("best_paired_with").array(), // tags like Core, Pull, Anti-Rotation
  coachingTips: text("coaching_tips").array(),
  mistakes: text("mistakes").array(),
  variations: text("variations").array(),
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

export type Exercise = typeof exercises.$inferSelect;
export type InsertExercise = z.infer<typeof insertExerciseSchema>;
export type WorkoutSession = typeof workoutSessions.$inferSelect;
export type InsertWorkoutSession = z.infer<typeof insertWorkoutSessionSchema>;
export type ExercisePairing = typeof exercisePairings.$inferSelect;
export type InsertExercisePairing = z.infer<typeof insertExercisePairingSchema>;
