import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertWorkoutSessionSchema } from "@shared/schema";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Get all exercises
  app.get("/api/exercises", async (req, res) => {
    try {
      const exercises = await storage.getAllExercises();
      res.json(exercises);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch exercises" });
    }
  });

  // Search exercises
  app.get("/api/exercises/search", async (req, res) => {
    try {
      const { q, category, equipment } = req.query;
      
      let exercises;
      if (q) {
        exercises = await storage.searchExercises(q as string);
      } else if (category && category !== "All Categories") {
        exercises = await storage.getExercisesByCategory(category as string);
      } else if (equipment && equipment !== "All Equipment") {
        exercises = await storage.getExercisesByEquipment(equipment as string);
      } else {
        exercises = await storage.getAllExercises();
      }
      
      res.json(exercises);
    } catch (error) {
      res.status(500).json({ message: "Failed to search exercises" });
    }
  });

  // Get exercise by ID
  app.get("/api/exercises/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const exercise = await storage.getExercise(id);
      
      if (!exercise) {
        return res.status(404).json({ message: "Exercise not found" });
      }
      
      res.json(exercise);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch exercise" });
    }
  });

  // Get exercise recommendations for pairing
  app.get("/api/exercises/:id/recommendations", async (req, res) => {
    try {
      const exerciseAId = parseInt(req.params.id);
      const exerciseA = await storage.getExercise(exerciseAId);
      
      if (!exerciseA) {
        return res.status(404).json({ message: "Exercise not found" });
      }

      // Get all exercises for pairing calculation
      const allExercises = await storage.getAllExercises();
      const candidateExercises = allExercises.filter(ex => ex.id !== exerciseAId);

      // Calculate compatibility scores using pairing logic
      const recommendations = candidateExercises.map(exerciseB => {
        const score = calculateCompatibilityScore(exerciseA, exerciseB);
        const reasoning = generatePairingReasoning(exerciseA, exerciseB);
        
        return {
          exercise: exerciseB,
          compatibilityScore: score,
          reasoning
        };
      });

      // Sort by compatibility score and return top recommendations
      recommendations.sort((a, b) => b.compatibilityScore - a.compatibilityScore);
      
      res.json({
        recommendations: recommendations.slice(0, 10) // Top 10 recommendations
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to generate recommendations" });
    }
  });

  // Create workout session
  app.post("/api/workout-sessions", async (req, res) => {
    try {
      const validatedData = insertWorkoutSessionSchema.parse(req.body);
      const session = await storage.createWorkoutSession(validatedData);
      res.status(201).json(session);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create workout session" });
    }
  });

  // Update workout session
  app.patch("/api/workout-sessions/:id", async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      
      const session = await storage.updateWorkoutSession(id, updates);
      
      if (!session) {
        return res.status(404).json({ message: "Workout session not found" });
      }
      
      res.json(session);
    } catch (error) {
      res.status(500).json({ message: "Failed to update workout session" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

// Trainer-inspired pairing logic
function calculateCompatibilityScore(exerciseA: any, exerciseB: any): number {
  let score = 0;
  
  // Opposing muscle groups (highest priority)
  if (isOpposingMovementPattern(exerciseA.movementPattern, exerciseB.movementPattern)) {
    score += 40;
  }
  
  // Same equipment (efficiency)
  if (exerciseA.equipment === exerciseB.equipment) {
    score += 25;
  }
  
  // Different primary muscle groups (recovery)
  if (!hasMuscleOverlap(exerciseA.primaryMuscles, exerciseB.primaryMuscles)) {
    score += 20;
  }
  
  // Difficulty balance
  const difficultyDiff = Math.abs(exerciseA.difficulty - exerciseB.difficulty);
  if (difficultyDiff <= 1) {
    score += 10;
  }
  
  // Compound + isolation pairing
  if (isCompoundIsolationPair(exerciseA, exerciseB)) {
    score += 5;
  }
  
  return Math.min(score, 100);
}

function isOpposingMovementPattern(patternA: string, patternB: string): boolean {
  const opposingPairs = [
    ["horizontal_push", "horizontal_pull"],
    ["vertical_push", "vertical_pull"],
    ["squat", "hinge"],
  ];
  
  return opposingPairs.some(pair => 
    (pair[0] === patternA && pair[1] === patternB) ||
    (pair[1] === patternA && pair[0] === patternB)
  );
}

function hasMuscleOverlap(musclesA: string[], musclesB: string[]): boolean {
  return musclesA.some(muscle => musclesB.includes(muscle));
}

function isCompoundIsolationPair(exerciseA: any, exerciseB: any): boolean {
  const compoundCategories = ["compound"];
  const isACompound = compoundCategories.includes(exerciseA.category) || exerciseA.primaryMuscles.length > 2;
  const isBCompound = compoundCategories.includes(exerciseB.category) || exerciseB.primaryMuscles.length > 2;
  
  return isACompound !== isBCompound;
}

function generatePairingReasoning(exerciseA: any, exerciseB: any): string[] {
  const reasoning = [];
  
  if (isOpposingMovementPattern(exerciseA.movementPattern, exerciseB.movementPattern)) {
    reasoning.push("Opposing movement patterns for balanced training");
  }
  
  if (exerciseA.equipment === exerciseB.equipment) {
    reasoning.push("Same equipment for efficient transitions");
  }
  
  if (!hasMuscleOverlap(exerciseA.primaryMuscles, exerciseB.primaryMuscles)) {
    reasoning.push("Different muscle groups allow for active recovery");
  }
  
  if (isCompoundIsolationPair(exerciseA, exerciseB)) {
    reasoning.push("Compound and isolation exercise pairing");
  }
  
  const difficultyDiff = Math.abs(exerciseA.difficulty - exerciseB.difficulty);
  if (difficultyDiff <= 1) {
    reasoning.push("Similar difficulty levels for consistent intensity");
  }
  
  return reasoning;
}
