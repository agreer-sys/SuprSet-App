import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertWorkoutSessionSchema, type Exercise } from "@shared/schema";
import { z } from "zod";
import { isTrainerApprovedPair } from "./trainer-pairs";
import { areFamiliesCompatible } from "./exercise-families";

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
      const { q, category, equipment, muscleGroup } = req.query;
      console.log("Search params:", { q, category, equipment, muscleGroup });
      
      let exercises;
      if (q) {
        exercises = await storage.searchExercises(q as string);
      } else {
        // Start with all exercises and apply filters
        exercises = await storage.getAllExercises();
        
        // Apply Exercise Type filter
        if (category && category !== "Exercise Type") {
          console.log("Filtering by Exercise Type:", category);
          exercises = exercises.filter(exercise => 
            exercise.exerciseType?.toLowerCase() === (category as string).toLowerCase()
          );
        }
        
        // Apply Equipment filter
        if (equipment && equipment !== "All Equipment") {
          console.log("Filtering by Equipment:", equipment);
          exercises = exercises.filter(exercise => 
            exercise.equipment.toLowerCase().includes((equipment as string).toLowerCase())
          );
        }
        
        // Apply Primary Muscle Group filter
        if (muscleGroup && muscleGroup !== "All Muscle Groups") {
          console.log("Filtering by Primary Muscle Group:", muscleGroup);
          exercises = exercises.filter(exercise => 
            exercise.primaryMuscleGroup?.toLowerCase() === (muscleGroup as string).toLowerCase()
          );
        }
      }
      
      console.log(`Returning ${exercises.length} exercises`);
      res.json(exercises);
    } catch (error) {
      console.error("Search error:", error);
      res.status(500).json({ message: "Failed to search exercises" });
    }
  });

  // Get filtered Exercise Type values from Airtable (before :id route)
  app.get("/api/exercises/categories", async (req, res) => {
    try {
      const allowedTypes = ["Push", "Pull", "Squat", "Hinge", "Lunge", "Isometric", "Explosive", "Accessory"];
      const allExercises = await storage.getAllExercises();
      const exerciseTypes = new Set<string>();
      
      allExercises.forEach(exercise => {
        if (exercise.exerciseType && allowedTypes.includes(exercise.exerciseType)) {
          exerciseTypes.add(exercise.exerciseType);
        }
      });
      
      res.json(Array.from(exerciseTypes).sort());
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch exercise types" });
    }
  });

  // Get unique equipment types from exercises (before :id route)
  app.get("/api/exercises/equipment", async (req, res) => {
    try {
      const allExercises = await storage.getAllExercises();
      const equipment = new Set<string>();
      
      allExercises.forEach(exercise => {
        const equipmentList = exercise.equipment.split(',').map(eq => eq.trim());
        equipmentList.forEach(eq => {
          if (eq) equipment.add(eq);
        });
      });
      
      res.json(Array.from(equipment).sort());
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch equipment" });
    }
  });

  // Get unique Primary Muscle Groups from Airtable (before :id route)
  app.get("/api/exercises/muscle-groups", async (req, res) => {
    try {
      const allExercises = await storage.getAllExercises();
      const muscleGroups = new Set<string>();
      
      allExercises.forEach(exercise => {
        if (exercise.primaryMuscleGroup) muscleGroups.add(exercise.primaryMuscleGroup);
      });
      
      res.json(Array.from(muscleGroups).sort());
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch muscle groups" });
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
      const trainerMode = req.query.trainerMode === 'true';
      
      if (!exerciseA) {
        return res.status(404).json({ message: "Exercise not found" });
      }

      // Get all exercises for pairing calculation
      const allExercises = await storage.getAllExercises();
      const candidateExercises = allExercises.filter(ex => ex.id !== exerciseAId);

      let recommendations;

      if (trainerMode) {
        // Trainer Mode: Strict binary filtering
        recommendations = candidateExercises
          .map(exerciseB => {
            const { isValid, score, reasoning } = calculateTrainerModeCompatibility(exerciseA, exerciseB);
            return isValid ? {
              exercise: exerciseB,
              compatibilityScore: score,
              reasoning
            } : null;
          })
          .filter(rec => rec !== null);
      } else {
        // Standard Mode: Algorithmic scoring
        recommendations = candidateExercises.map(exerciseB => {
          const { score, reasoning } = calculateCompatibilityScoreWithReasoning(exerciseA, exerciseB);
          
          return {
            exercise: exerciseB,
            compatibilityScore: score,
            reasoning
          };
        });
      }

      // Sort by compatibility score
      recommendations.sort((a, b) => b.compatibilityScore - a.compatibilityScore);
      
      res.json({
        recommendations: trainerMode ? recommendations : recommendations.slice(0, 10),
        mode: trainerMode ? 'trainer' : 'standard'
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

// Trainer Mode: Strict binary filtering with mandatory rules
function calculateTrainerModeCompatibility(exerciseA: Exercise, exerciseB: Exercise): { isValid: boolean; score: number; reasoning: string[] } {
  const reasons: string[] = [];
  
  // Rule 1: No self-pairing
  if (exerciseA.id === exerciseB.id) {
    return { isValid: false, score: 0, reasoning: ["Cannot pair exercise with itself"] };
  }
  
  // Rule 2: No deltoid-deltoid pairings
  const isDeltoidA = exerciseA.primaryMuscleGroup?.toLowerCase().includes('deltoid') || 
                    exerciseA.primaryMuscleGroup?.toLowerCase().includes('shoulder') ||
                    exerciseA.name.toLowerCase().includes('shoulder') ||
                    exerciseA.name.toLowerCase().includes('deltoid');
  const isDeltoidB = exerciseB.primaryMuscleGroup?.toLowerCase().includes('deltoid') || 
                    exerciseB.primaryMuscleGroup?.toLowerCase().includes('shoulder') ||
                    exerciseB.name.toLowerCase().includes('shoulder') ||
                    exerciseB.name.toLowerCase().includes('deltoid');
  
  if (isDeltoidA && isDeltoidB) {
    return { isValid: false, score: 0, reasoning: ["Trainer rule: No deltoid-deltoid pairings due to fatigue conflicts"] };
  }
  
  // Rule 3: Anchor flow preference (relaxed) - Anchored can pair with Mobile OR other Anchored
  // Only restrict if both are Mobile (creates flow issues)
  if (exerciseA.anchorType === "Mobile" && exerciseB.anchorType === "Mobile") {
    // Allow Mobile-Mobile pairings as they're common in circuits
  }
  
  // Rule 4: Setup time optimization - Prefer simpler setups for B, but allow flexibility
  // Only reject if A is already High setup AND B is also High setup (double complexity)
  if (exerciseA.setupTime === "High" && exerciseB.setupTime === "High") {
    return { isValid: false, score: 0, reasoning: ["Trainer rule: Avoid pairing two high-setup exercises"] };
  }
  
  // Rule 5: Equipment zone compatibility (Floor is universal)
  const isFloorInvolved = exerciseA.equipmentZone?.toLowerCase() === "floor" || 
                         exerciseB.equipmentZone?.toLowerCase() === "floor";
  if (!isFloorInvolved && exerciseA.equipmentZone !== exerciseB.equipmentZone) {
    return { isValid: false, score: 0, reasoning: ["Trainer rule: Different equipment zones (Floor exercises are exceptions)"] };
  }
  
  // Rule 6: Use exercise type compatibility as fallback for trainer mode
  const isExactPair = isTrainerApprovedPair(exerciseA.name, exerciseB.name);
  const isFamilyCompatible = areFamiliesCompatible(exerciseA.name, exerciseB.name);
  
  // Simplified trainer compatibility - Push pairs with Pull, Squat pairs with Hinge
  const isTypeCompatible = (
    (exerciseA.exerciseType === "Push" && exerciseB.exerciseType === "Pull") ||
    (exerciseA.exerciseType === "Pull" && exerciseB.exerciseType === "Push") ||
    (exerciseA.exerciseType === "Squat" && exerciseB.exerciseType === "Hinge") ||
    (exerciseA.exerciseType === "Hinge" && exerciseB.exerciseType === "Squat") ||
    (exerciseA.exerciseType === "Lunge" && exerciseB.exerciseType === "Hinge") ||
    (exerciseA.exerciseType === "Hinge" && exerciseB.exerciseType === "Lunge")
  );
  
  if (!isExactPair && !isFamilyCompatible && !isTypeCompatible) {
    return { isValid: false, score: 0, reasoning: ["Trainer rule: Not approved pairing type"] };
  }
  
  // If all rules pass, assign score based on quality indicators
  let score = 2; // Base perfect score
  
  // Quality bonuses for trainer-approved combinations
  if (isExactPair) {
    reasons.push("Curated trainer-approved pairing");
  } else if (isFamilyCompatible) {
    reasons.push("Compatible exercise families");
  }
  
  if (exerciseA.exerciseType === "Push" && exerciseB.exerciseType === "Pull") {
    reasons.push("Perfect push-pull antagonist pairing");
  }
  if (exerciseA.anchorType === "Anchored" && exerciseB.anchorType === "Mobile") {
    reasons.push("Optimal anchored-to-mobile flow");
  }
  if (exerciseA.equipmentZone === exerciseB.equipmentZone) {
    reasons.push("Same equipment zone for efficient transitions");
  }
  
  return { isValid: true, score, reasoning: reasons };
}

// Enhanced trainer-inspired pairing logic using all 22 Airtable fields
function calculateCompatibilityScoreWithReasoning(exerciseA: Exercise, exerciseB: Exercise): { score: number; reasoning: string[] } {
  let score = 0;
  const reasons: string[] = [];
  
  // Avoid pairing exercise with itself
  if (exerciseA.id === exerciseB.id) {
    return { score: 0, reasoning: [] };
  }
  
  // Avoid pairing deltoid/shoulder exercises together (anterior and posterior deltoids create push/pull conflicts)
  const isDeltoidExerciseA = exerciseA.primaryMuscleGroup?.toLowerCase().includes('deltoid') || 
                            exerciseA.primaryMuscleGroup?.toLowerCase().includes('shoulder') ||
                            exerciseA.name.toLowerCase().includes('shoulder') ||
                            exerciseA.name.toLowerCase().includes('deltoid');
  const isDeltoidExerciseB = exerciseB.primaryMuscleGroup?.toLowerCase().includes('deltoid') || 
                            exerciseB.primaryMuscleGroup?.toLowerCase().includes('shoulder') ||
                            exerciseB.name.toLowerCase().includes('shoulder') ||
                            exerciseB.name.toLowerCase().includes('deltoid');
  
  if (isDeltoidExerciseA && isDeltoidExerciseB) {
    return { score: 0, reasoning: ["Avoiding deltoid-deltoid pairing due to anterior/posterior fatigue conflicts"] };
  }
  
  // 1. Pairing Compatibility Tags (highest priority - 40 points)
  if (exerciseA.pairingCompatibility && exerciseB.exerciseType) {
    if (exerciseA.pairingCompatibility.includes(exerciseB.exerciseType)) {
      score += 40;
      reasons.push(`${exerciseA.name} pairs well with ${exerciseB.exerciseType} exercises`);
    }
  }
  
  // 2. Anchor Type preference (35 points) - prefer Anchored → Mobile
  if (exerciseA.anchorType === "Anchored" && exerciseB.anchorType === "Mobile") {
    score += 35;
    reasons.push("Optimal flow: anchored exercise to mobile exercise");
  } else if (exerciseA.anchorType === "Mobile" && exerciseB.anchorType === "Anchored") {
    score += 25;
    reasons.push("Good flow: mobile to anchored transition");
  }
  
  // 3. Exercise Type Opposition (30 points) - Push/Pull pairing
  if (exerciseA.exerciseType && exerciseB.exerciseType) {
    if ((exerciseA.exerciseType === "Push" && exerciseB.exerciseType === "Pull") ||
        (exerciseA.exerciseType === "Pull" && exerciseB.exerciseType === "Push")) {
      score += 30;
      reasons.push("Perfect push-pull antagonist pairing");
    }
  }
  
  // 4. Equipment Zone efficiency (25 points)
  if (exerciseA.equipmentZone === exerciseB.equipmentZone) {
    score += 25;
    reasons.push(`Both use ${exerciseA.equipmentZone} - minimal setup transition`);
  }
  
  // 5. Setup Time efficiency (20 points)
  if (exerciseA.setupTime === "High" && (exerciseB.setupTime === "Low" || exerciseB.setupTime === "Medium")) {
    score += 20;
    reasons.push("Efficient transition from complex to simple setup");
  } else if (exerciseA.setupTime === exerciseB.setupTime) {
    score += 15;
    reasons.push("Consistent setup complexity");
  }
  
  // 6. Best Paired With tags (15 points)
  if (exerciseA.bestPairedWith && exerciseB.tags) {
    const hasMatchingTags = exerciseA.bestPairedWith.some(tag => 
      exerciseB.tags?.includes(tag)
    );
    if (hasMatchingTags) {
      score += 15;
      reasons.push("Trainer-recommended pairing tags match");
    }
  }
  
  // 7. Primary Muscle Group differentiation (10 points)
  if (exerciseA.primaryMuscleGroup && exerciseB.primaryMuscleGroup && 
      exerciseA.primaryMuscleGroup !== exerciseB.primaryMuscleGroup) {
    score += 10;
    reasons.push("Different muscle groups allow active recovery");
  }
  
  // 8. Difficulty Level matching (5 points)
  if (exerciseA.difficultyLevel === exerciseB.difficultyLevel) {
    score += 5;
    reasons.push("Similar difficulty levels for consistent intensity");
  }
  
  // Add fallback reasoning if no specific reasons found
  if (reasons.length === 0) {
    reasons.push("Compatible exercise pairing based on movement patterns");
  }
  
  return { score: Math.min(score, 100), reasoning: reasons };
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

// Legacy compatibility functions
function calculateCompatibilityScore(exerciseA: Exercise, exerciseB: Exercise): number {
  const result = calculateCompatibilityScoreWithReasoning(exerciseA, exerciseB);
  return result.score;
}

function generatePairingReasoning(exerciseA: Exercise, exerciseB: Exercise): string[] {
  const result = calculateCompatibilityScoreWithReasoning(exerciseA, exerciseB);
  return result.reasoning;
}
