import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer } from "ws";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, isAdmin } from "./replitAuth";
import { 
  insertContributionSchema, 
  insertSuperSetSchema, 
  insertWorkoutSchema, 
  insertWorkoutSessionNewSchema,
  insertSetLogSchema,
  type Exercise,
  type CoachingSession
} from "@shared/schema";
import { z } from "zod";
import { isTrainerApprovedPair } from "./trainer-pairs";
import { langchainCoach } from "./langchain-coach";
import { setupRealtimeRelay } from "./realtime-relay";

// LangChain LLM Coaching Integration
async function generateCoachingResponse(
  userMessage: string, 
  exercise: Exercise | null, 
  coaching: CoachingSession
): Promise<string> {
  try {
    // Create workout state context for LangChain
    const workoutState = {
      currentExercise: exercise || undefined,
      currentSet: coaching.currentSet,
      totalSets: 3, // Default assumption, could be enhanced with actual workout data
      isRestPeriod: false, // Could be enhanced with timer state
      workoutPhase: 'working' as const,
      supersetProgress: {
        exerciseA: { sets: coaching.currentSet },
        exerciseB: { sets: coaching.currentSet }
      }
    };

    const context = {
      coaching,
      workoutState,
      exercise: exercise || undefined,
      sessionHistory: coaching.messages || []
    };

    // Use LangChain AI Coach service
    const response = await langchainCoach.generateCoachingResponse(userMessage, context);
    return response;
  } catch (error) {
    console.error('LangChain coaching error, falling back to rule-based:', error);
    // Fallback to rule-based response
    return generateRuleBasedCoachingResponse(userMessage, exercise, coaching);
  }
}

function generateRuleBasedCoachingResponse(
  userMessage: string, 
  exercise: Exercise | null, 
  coaching: CoachingSession
): string {
  const message = userMessage.toLowerCase();
  const exerciseName = exercise?.name || "this exercise";
  const currentSet = coaching.currentSet;
  
  // Form and technique questions
  if (message.includes('form') || message.includes('technique')) {
    const tips = exercise?.coachingBulletPoints;
    return tips 
      ? `Great question about form! For ${exerciseName}: ${tips}. Focus on controlled movement and proper breathing. You've got this!`
      : `Focus on controlled movement, maintain proper posture, and breathe steadily throughout ${exerciseName}. Keep your core engaged!`;
  }
  
  // Fatigue and difficulty
  if (message.includes('tired') || message.includes('hard') || message.includes('difficult')) {
    return currentSet >= 3 
      ? `You're in the challenging sets now - this is where the real gains happen! Focus on quality reps over quantity. If needed, reduce weight but maintain perfect form.`
      : `Feeling it already? That's your muscles working! Stay focused on your breathing and form. You're stronger than you think!`;
  }
  
  // Rest time questions
  if (message.includes('rest') || message.includes('break')) {
    const restTime = exercise?.restPeriodSec;
    return restTime 
      ? `For ${exerciseName}, aim for ${Math.round(restTime / 60)} minutes rest between sets. Use this time to hydrate and visualize your next set!`
      : `Take 90-150 seconds between sets. Stay moving lightly - don't sit down completely. You're doing great!`;
  }
  
  // Motivation and encouragement
  if (message.includes('give up') || message.includes('quit') || message.includes('stop')) {
    return `Hey, I know it's tough, but you showed up today and that's what matters! Every rep counts. If you need to modify, that's okay - consistency beats perfection every time!`;
  }
  
  // Progress and completion
  if (message.includes('done') || message.includes('finished')) {
    return currentSet >= 3 
      ? `Outstanding work! You crushed that set. Feel that accomplishment - you're getting stronger with every workout!`
      : `Nice work on that set! Take your rest, then let's hit the next one. You're building something great here!`;
  }
  
  // Weight selection
  if (message.includes('weight') || message.includes('heavy') || message.includes('light')) {
    return `Choose a weight where the last 2-3 reps feel challenging but you can maintain perfect form. It's better to go lighter and focus on quality than risk injury with too much weight.`;
  }
  
  // Default encouraging response
  const encouragingResponses = [
    `You're doing great! Stay focused on your form and breathing. Every rep is making you stronger!`,
    `Keep pushing! Remember why you started - you're building something amazing here!`,
    `Perfect! Stay in control of the movement and trust the process. You've got this!`,
    `Excellent work! Focus on the mind-muscle connection and make every rep count!`
  ];
  
  return encouragingResponses[Math.floor(Math.random() * encouragingResponses.length)];
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Setup Replit Auth
  await setupAuth(app);

  // Auth routes
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Admin check endpoint
  // TEMPORARY: Bypass auth for development testing
  app.get('/api/auth/is-admin', async (req: any, res) => {
    // In development, always return admin access for testing
    if (process.env.NODE_ENV === 'development') {
      return res.json({ isAdmin: true });
    }
    
    // In production, check actual authentication
    if (!req.isAuthenticated || !req.isAuthenticated()) {
      return res.status(401).json({ message: "Unauthorized" });
    }
    
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json({ isAdmin: user?.isAdmin || false });
    } catch (error) {
      console.error("Error checking admin status:", error);
      res.status(500).json({ message: "Failed to check admin status" });
    }
  });

  // Test admin endpoint (protected by isAdmin middleware)
  app.get('/api/admin/test', isAdmin, async (req: any, res) => {
    res.json({ 
      message: "Admin access confirmed", 
      userId: req.user.claims.sub 
    });
  });

  // Admin: Create block workout (PROTECTED)
  app.post('/api/admin/block-workouts', isAdmin, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { name, description, blocks: blocksData } = req.body;

      if (!name || !blocksData || !Array.isArray(blocksData) || blocksData.length === 0) {
        return res.status(400).json({ 
          message: "Workout name and blocks array required" 
        });
      }

      // Save workout with blocks
      const workout = await storage.createBlockWorkout({
        name,
        description,
        blocks: blocksData,
        createdBy: userId
      });

      res.status(201).json({
        id: workout.id,
        name: workout.name,
        message: "Workout created successfully"
      });
    } catch (error) {
      console.error("Error creating block workout:", error);
      res.status(500).json({ 
        message: "Failed to create workout",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Public: List available block workouts
  app.get('/api/block-workouts', async (req, res) => {
    try {
      const workouts = await storage.getBlockWorkouts();
      res.json(workouts);
    } catch (error) {
      console.error("Error fetching block workouts:", error);
      res.status(500).json({ message: "Failed to fetch workouts" });
    }
  });

  // Public: Get specific block workout with timeline
  app.get('/api/block-workouts/:id', async (req, res) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid workout ID" });
      }
      
      const workout = await storage.getBlockWorkout(id);
      if (!workout) {
        return res.status(404).json({ message: "Workout not found" });
      }
      
      res.json(workout);
    } catch (error) {
      console.error("Error fetching block workout:", error);
      res.status(500).json({ message: "Failed to fetch workout" });
    }
  });

  // Protected: Start block workout session
  app.post('/api/block-workout-sessions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { workoutId } = req.body;
      
      if (!workoutId) {
        return res.status(400).json({ message: "Workout ID required" });
      }
      
      const session = await storage.startBlockWorkoutSession(userId, workoutId);
      res.status(201).json(session);
    } catch (error) {
      console.error("Error starting block workout session:", error);
      res.status(500).json({ 
        message: "Failed to start session",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  // Protected: Get active block workout session
  app.get('/api/block-workout-sessions/active', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const session = await storage.getActiveBlockWorkoutSession(userId);
      
      if (!session) {
        return res.status(404).json({ message: "No active session found" });
      }
      
      res.json(session);
    } catch (error) {
      console.error("Error fetching active block workout session:", error);
      res.status(500).json({ message: "Failed to fetch active session" });
    }
  });

  // Contribution routes
  app.post('/api/contributions', isAuthenticated, async (req: any, res) => {
    try {
      console.log('=== CONTRIBUTION REQUEST ===');
      console.log('User:', req.user?.claims?.sub);
      console.log('Request body keys:', Object.keys(req.body));
      console.log('Equipment:', req.body.equipment);
      console.log('Image data length:', req.body.imageData?.length);
      
      const userId = req.user.claims.sub;
      const contributionData = insertContributionSchema.parse({
        ...req.body,
        userId
      });

      console.log('Schema validation passed');
      const contribution = await storage.createContribution(contributionData);
      
      console.log(`✅ User ${userId} contributed: ${contribution.equipment}`);
      res.status(201).json({
        id: contribution.id,
        message: "Contribution submitted successfully"
      });
    } catch (error) {
      console.error("❌ Error creating contribution:", error);
      if (error && typeof error === 'object' && 'name' in error && error.name === 'ZodError') {
        console.log('Zod validation errors:', (error as any).issues);
        res.status(400).json({ message: "Invalid contribution data", details: (error as any).issues });
      } else {
        res.status(500).json({ message: "Failed to submit contribution" });
      }
    }
  });

  app.get('/api/contributions/stats', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const stats = await storage.getContributionStats(userId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching contribution stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // Get user's contributions (metadata only, no image data)
  app.get('/api/contributions', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const contributions = await storage.getUserContributions(userId);
      
      // Return metadata only for viewing
      const contributionMetadata = contributions.map(c => ({
        id: c.id,
        equipment: c.equipment,
        confidence: c.confidence,
        trainingSet: c.trainingSet,
        tags: c.tags,
        verified: c.verified,
        votes: c.votes,
        moderationStatus: c.moderationStatus,
        imageSize: c.imageSize,
        notes: c.notes,
        createdAt: c.createdAt
      }));
      
      console.log(`📊 Returning ${contributionMetadata.length} contributions for user ${userId}`);
      res.json(contributionMetadata);
    } catch (error) {
      console.error("Error fetching user contributions:", error);
      res.status(500).json({ message: "Failed to fetch contributions" });
    }
  });

  // Delete contribution
  app.delete('/api/contributions/:id', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const contributionId = req.params.id;
      
      const success = await storage.deleteContribution(contributionId, userId);
      
      if (success) {
        console.log(`🗑️ Deleted contribution ${contributionId} for user ${userId}`);
        res.json({ message: "Contribution deleted successfully" });
      } else {
        res.status(404).json({ message: "Contribution not found or unauthorized" });
      }
    } catch (error) {
      console.error("Error deleting contribution:", error);
      res.status(500).json({ message: "Failed to delete contribution" });
    }
  });

  // Debug endpoint to view all contributions in memory (admin/development use)
  app.get('/api/debug/contributions', async (req, res) => {
    try {
      const allContributions = await storage.exportTrainingData('all');
      const contributionSummary = allContributions.map(c => ({
        id: c.id,
        userId: c.userId,
        equipment: c.equipment,
        confidence: c.confidence,
        trainingSet: c.trainingSet,
        tags: c.tags,
        imageSize: c.imageSize,
        moderationStatus: c.moderationStatus,
        createdAt: c.createdAt,
        notes: c.notes || 'No notes'
      }));
      
      res.json({
        total: contributionSummary.length,
        contributions: contributionSummary
      });
    } catch (error) {
      console.error("Error fetching debug contributions:", error);
      res.status(500).json({ message: "Failed to fetch debug contributions" });
    }
  });

  // Equipment analysis endpoint for debugging
  app.get('/api/debug/equipment-analysis', async (req, res) => {
    try {
      const exercises = await storage.getAllExercises();
      
      // Primary equipment analysis
      const primaryEquipment: { [key: string]: number } = {};
      const secondaryEquipment: { [key: string]: number } = {};
      const equipmentTypes: { [key: string]: number } = {};
      
      exercises.forEach(exercise => {
        // Count primary equipment
        if (exercise.equipmentPrimary) {
          primaryEquipment[exercise.equipmentPrimary] = (primaryEquipment[exercise.equipmentPrimary] || 0) + 1;
        }
        
        // Count secondary equipment
        exercise.equipmentSecondary?.forEach(sec => {
          secondaryEquipment[sec] = (secondaryEquipment[sec] || 0) + 1;
        });
        
        // Count equipment types
        exercise.equipmentType?.forEach(type => {
          equipmentTypes[type] = (equipmentTypes[type] || 0) + 1;
        });
      });
      
      // Sort by frequency
      const sortedPrimary = Object.entries(primaryEquipment)
        .sort(([,a], [,b]) => b - a)
        .map(([equipment, count]) => ({ equipment, count }));
      
      const sortedSecondary = Object.entries(secondaryEquipment)
        .sort(([,a], [,b]) => b - a)
        .map(([equipment, count]) => ({ equipment, count }));
        
      const sortedTypes = Object.entries(equipmentTypes)
        .sort(([,a], [,b]) => b - a)
        .map(([type, count]) => ({ type, count }));
      
      res.json({
        totalExercises: exercises.length,
        primaryEquipment: sortedPrimary,
        secondaryEquipment: sortedSecondary,
        equipmentTypes: sortedTypes,
        // Sample exercises with each primary equipment
        samples: sortedPrimary.slice(0, 10).map(({ equipment }) => {
          const sampleExercise = exercises.find(ex => ex.equipmentPrimary === equipment);
          return {
            primaryEquipment: equipment,
            exampleExercise: sampleExercise?.name,
            secondary: sampleExercise?.equipmentSecondary,
            types: sampleExercise?.equipmentType
          };
        })
      });
    } catch (error) {
      console.error("Error analyzing equipment:", error);
      res.status(500).json({ message: "Failed to analyze equipment" });
    }
  });

  // HTML image viewer page for easy visual inspection
  app.get('/api/debug/image-viewer', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      
      const allContributions = await storage.exportTrainingData('all');
      const paginatedContributions = allContributions.slice(offset, offset + limit);
      
      // Import AI training equipment catalog
      const { generateHTMLOptions } = await import('../shared/ai-equipment-catalog');
      const equipmentOptions = (selectedEquipment?: string) => generateHTMLOptions(selectedEquipment);
      
      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>AI Training Images - Label Verification</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
            .container { max-width: 1200px; margin: 0 auto; }
            .header { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
            .stats { display: flex; gap: 20px; margin-bottom: 20px; }
            .stat { background: white; padding: 15px; border-radius: 8px; text-align: center; }
            .images-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
            .image-card { background: white; border-radius: 8px; padding: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); position: relative; }
            .image-container { position: relative; width: 100%; height: 200px; border-radius: 4px; overflow: hidden; }
            .image-card img { width: 100%; height: 200px; object-fit: cover; border-radius: 4px; }
            .loading-placeholder { 
              position: absolute; 
              top: 50%; 
              left: 50%; 
              transform: translate(-50%, -50%); 
              color: #6b7280; 
              font-size: 14px; 
            }
            .equipment-label { font-size: 18px; font-weight: bold; color: #2563eb; margin: 10px 0; cursor: pointer; }
            .equipment-label:hover { background: #eff6ff; padding: 4px; border-radius: 4px; }
            .edit-mode { display: none; margin: 10px 0; }
            .edit-mode.active { display: block; }
            .equipment-select { padding: 8px; border: 1px solid #d1d5db; border-radius: 4px; width: 100%; margin-bottom: 10px; }
            .edit-buttons { display: flex; gap: 10px; }
            .save-btn { background: #10b981; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; }
            .cancel-btn { background: #6b7280; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; }
            .edit-icon { position: absolute; top: 10px; right: 10px; background: rgba(0,0,0,0.7); color: white; border: none; border-radius: 50%; width: 30px; height: 30px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-size: 14px; }
            .confidence { background: #10b981; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
            .training-set { background: #f59e0b; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; margin-left: 5px; }
            .metadata { color: #6b7280; font-size: 12px; margin-top: 10px; }
            .navigation { margin: 20px 0; text-align: center; }
            .nav-button { padding: 10px 20px; margin: 0 10px; background: #3b82f6; color: white; border: none; border-radius: 4px; cursor: pointer; }
            .success-flash { background: #d1fae5; border: 1px solid #10b981; color: #047857; padding: 4px 8px; border-radius: 4px; margin-top: 5px; font-size: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🤖 AI Training Images - Label Verification</h1>
              <p>Updated equipment labels for AI Vision training dataset</p>
            </div>
            
            <div class="stats">
              <div class="stat">
                <div style="font-size: 24px; font-weight: bold;">${allContributions.length}</div>
                <div>Total Images</div>
              </div>
              <div class="stat">
                <div style="font-size: 24px; font-weight: bold;">${offset + 1}-${Math.min(offset + limit, allContributions.length)}</div>
                <div>Showing</div>
              </div>
            </div>
            
            <div class="navigation">
              ${offset > 0 ? `<button class="nav-button" onclick="window.location.href='?offset=${Math.max(0, offset - limit)}&limit=${limit}'">&larr; Previous</button>` : ''}
              ${offset + limit < allContributions.length ? `<button class="nav-button" onclick="window.location.href='?offset=${offset + limit}&limit=${limit}'">Next &rarr;</button>` : ''}
            </div>
            
            <div class="images-grid">
              ${paginatedContributions.map((c, index) => {
                // Fix missing data URL prefix for base64 images
                const imageData = c.imageData.startsWith('data:') 
                  ? c.imageData 
                  : `data:image/jpeg;base64,${c.imageData}`;
                  
                return `
                <div class="image-card" data-contribution-id="${c.id}">
                  <div class="image-container">
                    <img 
                      class="lazy-image" 
                      data-src="${imageData}" 
                      alt="${c.equipment}"
                      loading="lazy"
                      style="opacity: 0; transition: opacity 0.3s ease;"
                    />
                    <div class="loading-placeholder">Loading...</div>
                    <button class="edit-icon" onclick="startEdit('${c.id}')" title="Edit label">✏️</button>
                  </div>
                  
                  <div class="equipment-label" onclick="startEdit('${c.id}')" title="Click to edit">
                    ${c.equipment}
                  </div>
                  
                  <div class="edit-mode" id="edit-${c.id}">
                    <select class="equipment-select" id="select-${c.id}">
                      ${equipmentOptions(c.equipment)}
                    </select>
                    <div class="edit-buttons">
                      <button class="save-btn" onclick="saveLabel('${c.id}')">Save</button>
                      <button class="cancel-btn" onclick="cancelEdit('${c.id}')">Cancel</button>
                    </div>
                  </div>
                  
                  <div>
                    <span class="confidence">Confidence: ${Math.round(c.confidence * 100)}%</span>
                    <span class="training-set">${c.trainingSet}</span>
                  </div>
                  <div class="metadata">
                    <div>Size: ${c.imageSize ? (c.imageSize / 1024).toFixed(1) : 'Unknown'}KB</div>
                    <div>Date: ${c.createdAt ? new Date(c.createdAt).toLocaleDateString() : 'Unknown'}</div>
                    <div>Notes: ${c.notes}</div>
                  </div>
                  <div id="success-${c.id}"></div>
                </div>`;
              }).join('')}
            </div>
            
            <div class="navigation">
              ${offset > 0 ? `<button class="nav-button" onclick="window.location.href='?offset=${Math.max(0, offset - limit)}&limit=${limit}'">&larr; Previous</button>` : ''}
              ${offset + limit < allContributions.length ? `<button class="nav-button" onclick="window.location.href='?offset=${offset + limit}&limit=${limit}'">Next &rarr;</button>` : ''}
            </div>
          </div>
          
          <script>
            // Lazy loading with progressive enhancement
            document.addEventListener('DOMContentLoaded', function() {
              const lazyImages = document.querySelectorAll('.lazy-image');
              
              // Create an intersection observer for lazy loading
              if ('IntersectionObserver' in window) {
                const imageObserver = new IntersectionObserver((entries, observer) => {
                  entries.forEach(entry => {
                    if (entry.isIntersecting) {
                      const img = entry.target;
                      const placeholder = img.nextElementSibling;
                      
                      img.src = img.dataset.src;
                      img.onload = () => {
                        img.style.opacity = '1';
                        if (placeholder) placeholder.style.display = 'none';
                      };
                      img.onerror = () => {
                        if (placeholder) placeholder.textContent = 'Failed to load';
                      };
                      
                      observer.unobserve(img);
                    }
                  });
                });
                
                lazyImages.forEach(img => imageObserver.observe(img));
              } else {
                // Fallback for browsers without IntersectionObserver
                lazyImages.forEach(img => {
                  const placeholder = img.nextElementSibling;
                  img.src = img.dataset.src;
                  img.onload = () => {
                    img.style.opacity = '1';
                    if (placeholder) placeholder.style.display = 'none';
                  };
                  img.onerror = () => {
                    if (placeholder) placeholder.textContent = 'Failed to load';
                  };
                });
              }
            });
            
            // Interactive relabeling functions
            function startEdit(contributionId) {
              const editMode = document.getElementById('edit-' + contributionId);
              const label = document.querySelector('[data-contribution-id="' + contributionId + '"] .equipment-label');
              
              editMode.classList.add('active');
              label.style.display = 'none';
            }
            
            function cancelEdit(contributionId) {
              const editMode = document.getElementById('edit-' + contributionId);
              const label = document.querySelector('[data-contribution-id="' + contributionId + '"] .equipment-label');
              
              editMode.classList.remove('active');
              label.style.display = 'block';
            }
            
            async function saveLabel(contributionId) {
              const select = document.getElementById('select-' + contributionId);
              const newEquipment = select.value;
              const editMode = document.getElementById('edit-' + contributionId);
              const label = document.querySelector('[data-contribution-id="' + contributionId + '"] .equipment-label');
              const successDiv = document.getElementById('success-' + contributionId);
              
              try {
                const response = await fetch('/api/debug/contributions/' + contributionId + '/label', {
                  method: 'PATCH',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ equipment: newEquipment })
                });
                
                if (response.ok) {
                  // Update the label display
                  label.textContent = newEquipment;
                  editMode.classList.remove('active');
                  label.style.display = 'block';
                  
                  // Show success message
                  successDiv.innerHTML = '<div class="success-flash">✓ Label updated successfully!</div>';
                  setTimeout(() => {
                    successDiv.innerHTML = '';
                  }, 3000);
                } else {
                  throw new Error('Failed to update label');
                }
              } catch (error) {
                alert('Error updating label: ' + error.message);
                console.error('Error:', error);
              }
            }
          </script>
        </body>
        </html>
      `;
      
      res.send(html);
    } catch (error) {
      console.error("Error generating image viewer:", error);
      res.status(500).send('Error generating image viewer');
    }
  });

  // Update image label endpoint for relabeling
  app.patch('/api/debug/contributions/:id/label', async (req, res) => {
    try {
      const contributionId = req.params.id;
      const { equipment } = req.body;
      
      if (!equipment || typeof equipment !== 'string') {
        return res.status(400).json({ message: "Equipment label is required" });
      }
      
      const updated = await storage.updateContributionLabel(contributionId, equipment);
      res.json({ success: true, contribution: updated });
    } catch (error) {
      console.error("Error updating contribution label:", error);
      res.status(500).json({ message: "Failed to update label" });
    }
  });

  // Trainer pairs management endpoints
  app.get('/api/trainer-pairs', async (req: any, res) => {
    try {
      const pairings = await storage.getTrainerApprovedPairs();
      res.json(pairings);
    } catch (error) {
      console.error("Error fetching trainer pairs:", error);
      res.status(500).json({ message: "Failed to fetch trainer pairs" });
    }
  });

  app.post('/api/trainer-pairs', async (req: any, res) => {
    try {
      const pairingData = {
        ...req.body,
        approvedBy: null  // Make it null since we don't have proper auth yet
      };
      
      const pairing = await storage.createTrainerPairing(pairingData);
      res.json(pairing);
    } catch (error) {
      console.error("Error creating trainer pairing:", error);
      res.status(500).json({ message: "Failed to create trainer pairing" });
    }
  });

  app.patch('/api/trainer-pairs/:id', async (req: any, res) => {
    try {
      const pairingId = parseInt(req.params.id);
      const updates = req.body;
      
      const pairing = await storage.updateTrainerPairing(pairingId, updates);
      res.json(pairing);
    } catch (error) {
      console.error("Error updating trainer pairing:", error);
      res.status(500).json({ message: "Failed to update trainer pairing" });
    }
  });

  app.delete('/api/trainer-pairs/:id', async (req: any, res) => {
    try {
      const pairingId = parseInt(req.params.id);
      const success = await storage.deleteTrainerPairing(pairingId);
      
      if (success) {
        res.json({ message: "Trainer pairing deleted successfully" });
      } else {
        res.status(404).json({ message: "Trainer pairing not found" });
      }
    } catch (error) {
      console.error("Error deleting trainer pairing:", error);
      res.status(500).json({ message: "Failed to delete trainer pairing" });
    }
  });

  // Training data export endpoints for AI model development
  app.get('/api/training/export', isAuthenticated, async (req: any, res) => {
    try {
      const { format = 'roboflow', dataset = 'all' } = req.query;
      const trainingData = await storage.exportTrainingData(dataset as string);
      
      if (format === 'roboflow') {
        // Format for Roboflow Phase 3 integration
        const roboflowData = {
          version: "1.0",
          dataset: dataset,
          exported_at: new Date().toISOString(),
          total_images: trainingData.length,
          classes: [...new Set(trainingData.map(d => d.equipment))],
          images: trainingData.map(contribution => ({
            id: contribution.id,
            filename: `${contribution.id}.jpg`,
            width: contribution.imageWidth || 640,
            height: contribution.imageHeight || 480,
            annotations: contribution.boundingBoxes || [{
              x: 0,
              y: 0,
              width: contribution.imageWidth || 640,
              height: contribution.imageHeight || 480,
              label: contribution.equipment,
              confidence: contribution.confidence
            }]
          }))
        };
        
        res.json(roboflowData);
      } else {
        // Raw format
        res.json(trainingData);
      }
    } catch (error) {
      console.error("Error exporting training data:", error);
      res.status(500).json({ message: "Failed to export training data" });
    }
  });

  app.get('/api/training/stats', isAuthenticated, async (req: any, res) => {
    try {
      const stats = await storage.getTrainingDataStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching training stats:", error);
      res.status(500).json({ message: "Failed to fetch training stats" });
    }
  });


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

  // Get equipment types from dedicated catalog (before :id route)
  app.get("/api/exercises/equipment", async (req, res) => {
    try {
      // Use dedicated equipment catalog for consistent dropdown data
      const { getActiveEquipmentNames } = await import('../shared/equipment-catalog');
      const equipmentNames = getActiveEquipmentNames();
      
      console.log(`📋 Serving ${equipmentNames.length} equipment items from catalog`);
      res.json(equipmentNames);
    } catch (error) {
      console.error("Error loading equipment catalog:", error);
      
      // Fallback to Airtable data if catalog fails (without TEST modifications)
      try {
        const allExercises = await storage.getAllExercises();
        const equipment = new Set<string>();
        
        allExercises.forEach(exercise => {
          if (exercise.equipmentPrimary) {
            equipment.add(exercise.equipmentPrimary);
          }
          if (exercise.equipmentSecondary) {
            for (const eq of exercise.equipmentSecondary) {
              if (eq) equipment.add(eq);
            }
          }
          if (exercise.equipment && exercise.equipment !== 'bodyweight') {
            const equipmentList = exercise.equipment.split(',').map(eq => eq.trim());
            for (const eq of equipmentList) {
              if (eq) equipment.add(eq);
            }
          }
        });
        
        const sortedEquipment = Array.from(equipment).sort();
        console.log(`📋 Fallback: Serving ${sortedEquipment.length} equipment items from Airtable`);
        res.json(sortedEquipment);
      } catch (fallbackError) {
        console.error("Fallback equipment fetch failed:", fallbackError);
        res.status(500).json({ message: "Failed to fetch equipment types" });
      }
    }
  });

  // Get AI training equipment for image labeling and batch uploads
  app.get("/api/ai-training/equipment", async (req, res) => {
    try {
      const { getAITrainingEquipment } = await import('../shared/ai-equipment-catalog');
      const aiEquipment = getAITrainingEquipment();
      
      console.log(`🤖 Serving ${aiEquipment.length} AI training equipment items`);
      res.json(aiEquipment);
    } catch (error) {
      console.error("Error loading AI training equipment catalog:", error);
      res.status(500).json({ message: "Failed to fetch AI training equipment types" });
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

  // Preview superset pair as Block format (non-admin, read-only)
  app.post("/api/recommendations/preview-block", async (req, res) => {
    try {
      const { exerciseAId, exerciseBId, params } = req.body;
      
      if (!exerciseAId || !exerciseBId) {
        return res.status(400).json({ message: "Both exerciseAId and exerciseBId are required" });
      }

      // Validate and coerce params to numbers
      const setsPerExercise = Number(params?.setsPerExercise) || 3;
      const workSec = Number(params?.workSec) || 45;
      const restSec = Number(params?.restSec) || 60;
      const transitionSec = Number(params?.transitionSec) || 10;
      const awaitReadyBeforeStart = params?.awaitReadyBeforeStart === true || params?.awaitReadyBeforeStart === 'true';

      // Validate numbers are valid
      if (isNaN(setsPerExercise) || isNaN(workSec) || isNaN(restSec) || isNaN(transitionSec)) {
        return res.status(400).json({ message: "Invalid numeric parameters" });
      }

      // Fetch exercises from Airtable
      const [exerciseA, exerciseB] = await Promise.all([
        storage.getExercise(exerciseAId),
        storage.getExercise(exerciseBId)
      ]);

      if (!exerciseA || !exerciseB) {
        return res.status(404).json({ message: "One or both exercises not found" });
      }

      // Calculate duration with guaranteed numeric types
      const estimatedDurationSec = (workSec * 2 + restSec + transitionSec) * setsPerExercise;

      // Create Block structure compatible with compiler
      const block = {
        name: `${exerciseA.name} + ${exerciseB.name} Superset`,
        description: `Superset pairing: ${exerciseA.name} (${exerciseA.exerciseType || 'general'}) with ${exerciseB.name} (${exerciseB.exerciseType || 'general'})`,
        type: "superset",
        params: {
          setsPerExercise,
          workSec,
          restSec,
          transitionSec,
          awaitReadyBeforeStart,
        },
        category: "strength",
        difficulty: Math.round((exerciseA.difficulty + exerciseB.difficulty) / 2),
        estimatedDurationSec,
        equipmentNeeded: Array.from(new Set([
          exerciseA.equipmentPrimary || exerciseA.equipment,
          exerciseB.equipmentPrimary || exerciseB.equipment,
          ...(exerciseA.equipmentSecondary || []),
          ...(exerciseB.equipmentSecondary || [])
        ].filter(Boolean))),
        muscleGroups: Array.from(new Set([
          exerciseA.primaryMuscleGroup,
          exerciseB.primaryMuscleGroup
        ].filter(Boolean))),
        exercises: [
          {
            exerciseId: exerciseA.id,
            orderIndex: 0,
            exerciseName: exerciseA.name,
            primaryMuscleGroup: exerciseA.primaryMuscleGroup,
            movementPattern: exerciseA.exerciseType || exerciseA.movementPattern,
            equipmentPrimary: exerciseA.equipmentPrimary || exerciseA.equipment,
            equipmentSecondary: exerciseA.equipmentSecondary || [],
            coachingBulletPoints: exerciseA.coachingBulletPoints,
            videoUrl: exerciseA.videoUrl,
            imageUrl: exerciseA.imageUrl,
          },
          {
            exerciseId: exerciseB.id,
            orderIndex: 1,
            exerciseName: exerciseB.name,
            primaryMuscleGroup: exerciseB.primaryMuscleGroup,
            movementPattern: exerciseB.exerciseType || exerciseB.movementPattern,
            equipmentPrimary: exerciseB.equipmentPrimary || exerciseB.equipment,
            equipmentSecondary: exerciseB.equipmentSecondary || [],
            coachingBulletPoints: exerciseB.coachingBulletPoints,
            videoUrl: exerciseB.videoUrl,
            imageUrl: exerciseB.imageUrl,
          }
        ]
      };

      res.json({ block });
    } catch (error) {
      console.error("Failed to preview block:", error);
      res.status(500).json({ message: "Failed to preview block" });
    }
  });

  // Convert superset pair to Block format (for admin panel)
  app.post("/api/recommendations/create-block", isAdmin, async (req, res) => {
    try {
      const { exerciseAId, exerciseBId, params } = req.body;
      
      if (!exerciseAId || !exerciseBId) {
        return res.status(400).json({ message: "Both exerciseAId and exerciseBId are required" });
      }

      // Validate and coerce params to numbers
      const setsPerExercise = Number(params?.setsPerExercise) || 3;
      const workSec = Number(params?.workSec) || 45;
      const restSec = Number(params?.restSec) || 60;
      const transitionSec = Number(params?.transitionSec) || 10;
      const awaitReadyBeforeStart = params?.awaitReadyBeforeStart === true || params?.awaitReadyBeforeStart === 'true';

      // Validate numbers are valid
      if (isNaN(setsPerExercise) || isNaN(workSec) || isNaN(restSec) || isNaN(transitionSec)) {
        return res.status(400).json({ message: "Invalid numeric parameters" });
      }

      // Fetch exercises from Airtable
      const [exerciseA, exerciseB] = await Promise.all([
        storage.getExercise(exerciseAId),
        storage.getExercise(exerciseBId)
      ]);

      if (!exerciseA || !exerciseB) {
        return res.status(404).json({ message: "One or both exercises not found" });
      }

      // Calculate duration with guaranteed numeric types
      const estimatedDurationSec = (workSec * 2 + restSec + transitionSec) * setsPerExercise;

      // Create Block structure compatible with compiler
      const block = {
        name: `${exerciseA.name} + ${exerciseB.name} Superset`,
        description: `Superset pairing: ${exerciseA.name} (${exerciseA.exerciseType || 'general'}) with ${exerciseB.name} (${exerciseB.exerciseType || 'general'})`,
        type: "superset",
        params: {
          setsPerExercise,
          workSec,
          restSec,
          transitionSec,
          awaitReadyBeforeStart,
        },
        category: "strength",
        difficulty: Math.round((exerciseA.difficulty + exerciseB.difficulty) / 2),
        estimatedDurationSec,
        equipmentNeeded: Array.from(new Set([
          exerciseA.equipmentPrimary || exerciseA.equipment,
          exerciseB.equipmentPrimary || exerciseB.equipment,
          ...(exerciseA.equipmentSecondary || []),
          ...(exerciseB.equipmentSecondary || [])
        ].filter(Boolean))),
        muscleGroups: Array.from(new Set([
          exerciseA.primaryMuscleGroup,
          exerciseB.primaryMuscleGroup
        ].filter(Boolean))),
        exercises: [
          {
            exerciseId: exerciseA.id,
            orderIndex: 0,
            exerciseName: exerciseA.name,
            primaryMuscleGroup: exerciseA.primaryMuscleGroup,
            movementPattern: exerciseA.exerciseType || exerciseA.movementPattern,
            equipmentPrimary: exerciseA.equipmentPrimary || exerciseA.equipment,
            equipmentSecondary: exerciseA.equipmentSecondary || [],
            coachingBulletPoints: exerciseA.coachingBulletPoints,
            videoUrl: exerciseA.videoUrl,
            imageUrl: exerciseA.imageUrl,
          },
          {
            exerciseId: exerciseB.id,
            orderIndex: 1,
            exerciseName: exerciseB.name,
            primaryMuscleGroup: exerciseB.primaryMuscleGroup,
            movementPattern: exerciseB.exerciseType || exerciseB.movementPattern,
            equipmentPrimary: exerciseB.equipmentPrimary || exerciseB.equipment,
            equipmentSecondary: exerciseB.equipmentSecondary || [],
            coachingBulletPoints: exerciseB.coachingBulletPoints,
            videoUrl: exerciseB.videoUrl,
            imageUrl: exerciseB.imageUrl,
          }
        ]
      };

      res.json({ block });
    } catch (error) {
      console.error("Failed to create block from recommendation:", error);
      res.status(500).json({ message: "Failed to create block" });
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

  // Enhanced contribution analytics for personal data collection
  app.get('/api/contributions/analytics', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const userContributions = await storage.getUserContributions(userId);
      
      // Equipment distribution analysis
      const equipmentCount: Record<string, number> = {};
      const dailyContributions: Record<string, number> = {};
      const qualityMetrics = {
        totalContributions: userContributions.length,
        averageConfidence: 0,
        verifiedCount: 0,
        trainingSetDistribution: { train: 0, validation: 0, test: 0 }
      };

      userContributions.forEach(contribution => {
        // Equipment count
        equipmentCount[contribution.equipment] = (equipmentCount[contribution.equipment] || 0) + 1;
        
        // Daily contributions
        const date = contribution.createdAt.toISOString().split('T')[0];
        dailyContributions[date] = (dailyContributions[date] || 0) + 1;
        
        // Quality metrics
        qualityMetrics.averageConfidence += contribution.confidence;
        if (contribution.verified) qualityMetrics.verifiedCount++;
        if (contribution.trainingSet) {
          qualityMetrics.trainingSetDistribution[contribution.trainingSet]++;
        }
      });

      if (userContributions.length > 0) {
        qualityMetrics.averageConfidence /= userContributions.length;
      }

      res.json({
        equipmentCount,
        dailyContributions,
        qualityMetrics,
        recentContributions: userContributions.slice(0, 10) // Last 10 contributions
      });
    } catch (error: any) {
      console.error("Error fetching contribution analytics:", error);
      res.status(500).json({ message: "Failed to fetch contribution analytics" });
    }
  });

  // Batch contribution endpoint for optimized uploads
  app.post('/api/contributions/batch', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { contributions } = req.body;

      if (!Array.isArray(contributions) || contributions.length === 0) {
        return res.status(400).json({ message: "No contributions provided" });
      }

      const results = [];
      const errors = [];

      for (let i = 0; i < contributions.length; i++) {
        try {
          // Check for duplicate images
          if (contributions[i].imageHash) {
            const isDuplicate = await storage.checkDuplicateImage(contributions[i].imageHash);
            if (isDuplicate) {
              console.log(`Duplicate image detected for contribution ${i}`);
              errors.push({ index: i, error: "Duplicate image detected" });
              results.push({ index: i, success: false, error: "Duplicate image detected" });
              continue;
            }
          }

          const contributionData = insertContributionSchema.parse({
            ...contributions[i],
            userId
          });

          const contribution = await storage.createContribution(contributionData);
          results.push({ index: i, success: true, id: contribution.id });
        } catch (error: any) {
          console.error(`Batch contribution ${i} failed:`, error);
          errors.push({ index: i, error: error.message });
          results.push({ index: i, success: false, error: error.message });
        }
      }

      res.json({
        totalSubmitted: contributions.length,
        successful: results.filter(r => r.success).length,
        failed: errors.length,
        results,
        errors
      });
    } catch (error: any) {
      console.error("Batch contribution error:", error);
      res.status(500).json({ message: "Failed to process batch contributions" });
    }
  });

  // Super Sets API routes
  app.get('/api/supersets', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const superSets = await storage.getUserSuperSets(userId);
      res.json(superSets);
    } catch (error: any) {
      console.error("Error fetching super sets:", error);
      res.status(500).json({ message: "Failed to fetch super sets" });
    }
  });

  app.post('/api/supersets', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const superSetData = insertSuperSetSchema.parse({
        ...req.body,
        userId
      });

      const superSet = await storage.createSuperSet(superSetData);
      res.status(201).json(superSet);
    } catch (error: any) {
      console.error("Error creating super set:", error);
      res.status(500).json({ message: "Failed to create super set" });
    }
  });

  app.get('/api/supersets/:id', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const superSet = await storage.getSuperSet(id);
      
      if (!superSet) {
        return res.status(404).json({ message: "Super set not found" });
      }

      res.json(superSet);
    } catch (error: any) {
      console.error("Error fetching super set:", error);
      res.status(500).json({ message: "Failed to fetch super set" });
    }
  });

  app.put('/api/supersets/:id', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const updates = req.body;
      
      const superSet = await storage.updateSuperSet(id, updates);
      res.json(superSet);
    } catch (error: any) {
      console.error("Error updating super set:", error);
      res.status(500).json({ message: "Failed to update super set" });
    }
  });

  app.delete('/api/supersets/:id', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteSuperSet(id);
      res.status(204).send();
    } catch (error: any) {
      console.error("Error deleting super set:", error);
      res.status(500).json({ message: "Failed to delete super set" });
    }
  });

  // Workouts API routes
  app.get('/api/workouts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workouts = await storage.getUserWorkouts(userId);
      res.json(workouts);
    } catch (error: any) {
      console.error("Error fetching workouts:", error);
      res.status(500).json({ message: "Failed to fetch workouts" });
    }
  });

  app.post('/api/workouts', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const workoutData = insertWorkoutSchema.parse({
        ...req.body,
        userId
      });

      const workout = await storage.createWorkout(workoutData);
      res.status(201).json(workout);
    } catch (error: any) {
      console.error("Error creating workout:", error);
      res.status(500).json({ message: "Failed to create workout" });
    }
  });

  app.get('/api/workouts/:id', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const workout = await storage.getWorkoutWithSuperSets(id);
      
      if (!workout) {
        return res.status(404).json({ message: "Workout not found" });
      }

      res.json(workout);
    } catch (error: any) {
      console.error("Error fetching workout:", error);
      res.status(500).json({ message: "Failed to fetch workout" });
    }
  });

  // Shared helper function for creating coaching sessions - NO intro messages, focus on workout execution only
  async function createCoachingSessionIfRequested(
    sessionId: number, 
    coachingOptions: any, 
    workoutInfo?: { name: string; duration: number; exercises: Array<{ name: string; sets?: number; workSeconds?: number; restSeconds?: number }> }
  ) {
    if (coachingOptions?.enableCoaching) {
      // No intro messages - start with empty messages array, coaching starts with timer cues only
      await storage.createCoachingSession({
        sessionId,
        voiceEnabled: coachingOptions.voiceEnabled || false,
        preferredStyle: coachingOptions.coachingStyle || 'motivational',
        messages: [], // Empty - no intro, coaching is timer-based only
        currentSet: 1
      });
    }
  }

  // Workout Sessions API routes
  app.post('/api/workout-sessions/start', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Check if user already has an active session
      const activeSession = await storage.getActiveWorkoutSession(userId);
      if (activeSession) {
        return res.status(400).json({ 
          message: "You already have an active workout session",
          activeSession 
        });
      }

      const sessionData = insertWorkoutSessionNewSchema.parse({
        ...req.body,
        userId
      });

      const session = await storage.startWorkoutSession(sessionData);
      
      // Create coaching session if requested using shared helper
      await createCoachingSessionIfRequested(session.id, req.body);

      res.status(201).json(session);
    } catch (error: any) {
      console.error("Error starting workout session:", error);
      res.status(500).json({ message: "Failed to start workout session" });
    }
  });

  app.get('/api/workout-sessions/active', async (req: any, res) => {
    try {
      // TEMP: Using mock userId for testing - TODO: Re-enable auth
      const userId = 'user123';
      const session = await storage.getActiveWorkoutSession(userId);
      
      if (!session) {
        return res.status(404).json({ message: "No active workout session" });
      }

      res.json(session);
    } catch (error: any) {
      console.error("Error fetching active session:", error);
      res.status(500).json({ message: "Failed to fetch active session" });
    }
  });

  app.post('/api/workout-sessions/:id/complete', isAuthenticated, async (req: any, res) => {
    try {
      const id = parseInt(req.params.id);
      const { notes } = req.body;
      
      const session = await storage.completeWorkoutSession(id, notes);
      res.json(session);
    } catch (error: any) {
      console.error("Error completing workout session:", error);
      res.status(500).json({ message: "Failed to complete workout session" });
    }
  });

  // Set Logging API routes
  app.post('/api/sets/log', isAuthenticated, async (req: any, res) => {
    try {
      const setLogData = insertSetLogSchema.parse(req.body);
      const setLog = await storage.logSet(setLogData);
      res.status(201).json(setLog);
    } catch (error: any) {
      console.error("Error logging set:", error);
      res.status(500).json({ message: "Failed to log set" });
    }
  });

  app.get('/api/workout-sessions/:id/sets', isAuthenticated, async (req: any, res) => {
    try {
      const sessionId = parseInt(req.params.id);
      const setLogs = await storage.getSessionSetLogs(sessionId);
      res.json(setLogs);
    } catch (error: any) {
      console.error("Error fetching set logs:", error);
      res.status(500).json({ message: "Failed to fetch set logs" });
    }
  });

  // LLM Coaching API routes
  // TEMP: Auth disabled for testing - TODO: Re-enable
  app.get('/api/coaching/:sessionId', async (req: any, res) => {
    try {
      const sessionId = parseInt(req.params.sessionId);
      const coaching = await storage.getCoachingSession(sessionId);
      
      if (!coaching) {
        return res.status(404).json({ message: "Coaching session not found" });
      }

      res.json(coaching);
    } catch (error: any) {
      console.error("Error fetching coaching session:", error);
      res.status(500).json({ message: "Failed to fetch coaching session" });
    }
  });

  // TEMP: Auth disabled for testing - TODO: Re-enable
  app.post('/api/coaching/:sessionId/message', async (req: any, res) => {
    try {
      const sessionId = parseInt(req.params.sessionId);
      const { message, exerciseId, setNumber, workoutContext } = req.body;
      
      const coaching = await storage.getCoachingSession(sessionId);
      if (!coaching) {
        return res.status(404).json({ message: "Coaching session not found" });
      }

      // Initialize LangChain coaching session if needed
      await langchainCoach.initializeCoachingSession(coaching);

      // Get exercise details for context
      const exercise = exerciseId ? await storage.getExercise(exerciseId) : null;
      
      // Build enhanced workout state from client data
      const workoutState = {
        currentExercise: exercise || undefined,
        currentSet: workoutContext?.currentSet || setNumber || coaching.currentSet,
        totalSets: workoutContext?.totalSets || 6,
        isRestPeriod: workoutContext?.isRestPeriod || false,
        restTimeRemaining: workoutContext?.restTimeRemaining,
        workoutPhase: workoutContext?.isRestPeriod ? 'cooldown' as const : 'working' as const,
        supersetProgress: {
          exerciseA: { sets: workoutContext?.completedSets || 0 },
          exerciseB: { sets: workoutContext?.completedSets || 0 }
        }
      };

      // Enhanced coaching context with real data
      const context = {
        coaching,
        workoutState,
        exercise: exercise || undefined,
        sessionHistory: coaching.messages || []
      };
      
      // Check if user is confirming readiness to start
      // This is the first user message if there's only the intro message (1) or intro + first exchange (3 or fewer)
      const userMessage = message.toLowerCase().trim();
      const readyKeywords = ['ready', 'yes', 'let\'s go', 'lets go', 'start', 'go', 'begin', 'yeah', 'yep', 'sure', 'ok', 'okay'];
      // Count only user messages to see if this is the first user interaction
      const userMessageCount = coaching.messages.filter(m => m.role === 'user').length;
      const isReadyConfirmation = userMessageCount === 0 && 
                                  readyKeywords.some(keyword => userMessage.includes(keyword));
      
      let aiResponse: string;
      let startCountdown = false;
      let shouldPause = false;
      let shouldResume = false;
      
      if (isReadyConfirmation) {
        // User confirmed they're ready - initiate countdown (countdown is visual, not narrated)
        const style = coaching.preferredStyle;
        if (style === 'motivational') {
          aiResponse = "Let's do this!";
        } else if (style === 'technical') {
          aiResponse = "Confirmed. Get ready.";
        } else {
          aiResponse = "Alright, let's roll!";
        }
        startCountdown = true;
      } else {
        // Normal coaching response using LangChain
        const response = await langchainCoach.generateCoachingResponse(message, context);
        aiResponse = response.message;
        startCountdown = response.startCountdown || false;
        shouldPause = response.shouldPause || false;
        shouldResume = response.shouldResume || false;
      }
      
      // Update coaching session with new messages
      const updatedMessages = [
        ...coaching.messages,
        {
          role: 'user' as const,
          content: message,
          timestamp: new Date().toISOString()
        },
        {
          role: 'assistant' as const,
          content: aiResponse,
          timestamp: new Date().toISOString()
        }
      ];

      // Build update object - only include currentExercise if it's a valid ID
      const updateData: any = {
        messages: updatedMessages,
        currentSet: setNumber || coaching.currentSet
      };
      
      // Only update currentExercise if we have a valid exerciseId (not null/undefined)
      if (exerciseId !== null && exerciseId !== undefined) {
        updateData.currentExercise = exerciseId;
      }
      
      const updatedCoaching = await storage.updateCoachingSession(coaching.id, updateData);

      res.json({ 
        message: aiResponse,
        coaching: updatedCoaching,
        startCountdown, // Signal frontend to start countdown timer
        shouldPause,    // Signal frontend to pause workout
        shouldResume    // Signal frontend to resume workout
      });
    } catch (error: any) {
      console.error("Error processing coaching message:", error);
      res.status(500).json({ message: "Failed to process coaching message" });
    }
  });

  // Voice transcription endpoint
  // TEMP: Auth disabled for testing - TODO: Re-enable
  app.post('/api/coaching/:sessionId/transcribe', async (req: any, res) => {
    try {
      const sessionId = parseInt(req.params.sessionId);
      const audioBuffer = req.body; // Expecting binary audio data
      
      const coaching = await storage.getCoachingSession(sessionId);
      if (!coaching) {
        return res.status(404).json({ message: "Coaching session not found" });
      }

      // Transcribe audio using OpenAI Whisper via LangChain
      const transcription = await langchainCoach.transcribeAudio(audioBuffer);
      
      res.json({ text: transcription });
    } catch (error: any) {
      console.error("Error transcribing audio:", error);
      res.status(500).json({ message: "Failed to transcribe audio" });
    }
  });

  // Generate speech from text
  // TEMP: Auth disabled for testing - TODO: Re-enable
  app.post('/api/coaching/:sessionId/speech', async (req: any, res) => {
    try {
      const sessionId = parseInt(req.params.sessionId);
      const { text, voice } = req.body;
      
      const coaching = await storage.getCoachingSession(sessionId);
      if (!coaching) {
        return res.status(404).json({ message: "Coaching session not found" });
      }

      // Generate speech using OpenAI TTS via LangChain
      const audioBuffer = await langchainCoach.generateSpeech(text, voice);
      
      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.byteLength.toString()
      });
      
      res.send(Buffer.from(audioBuffer));
    } catch (error: any) {
      console.error("Error generating speech:", error);
      res.status(500).json({ message: "Failed to generate speech" });
    }
  });

  // Enhanced pairing recommendation with superset creation
  app.post('/api/supersets/from-recommendation', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const { exerciseAId, exerciseBId, name, description } = req.body;
      
      // Create superset from recommendation
      const superSetData = insertSuperSetSchema.parse({
        userId,
        name: name || "Custom Superset",
        description: description || "Generated from recommendation",
        exerciseAId,
        exerciseBId,
        defaultSets: 3,
        defaultRestTime: 150,
        difficulty: 3,
        tags: ["custom", "from-recommendation"],
        isPublic: false
      });

      const superSet = await storage.createSuperSet(superSetData);
      res.status(201).json(superSet);
    } catch (error: any) {
      console.error("Error creating superset from recommendation:", error);
      res.status(500).json({ message: "Failed to create superset from recommendation" });
    }
  });

  // Pre-built Workout Template API Routes
  app.get("/api/workout-templates", async (req, res) => {
    try {
      const { workoutType, category, difficulty } = req.query;
      
      const filter: { workoutType?: string; category?: string; difficulty?: number } = {};
      if (workoutType) filter.workoutType = workoutType as string;
      if (category) filter.category = category as string;
      if (difficulty) filter.difficulty = parseInt(difficulty as string);
      
      const templates = await storage.getWorkoutTemplates(filter);
      res.json(templates);
    } catch (error) {
      console.error("Error fetching workout templates:", error);
      res.status(500).json({ message: "Failed to fetch workout templates" });
    }
  });

  app.get("/api/workout-templates/:id", async (req, res) => {
    try {
      const templateId = parseInt(req.params.id);
      if (isNaN(templateId)) {
        return res.status(400).json({ message: "Invalid template ID" });
      }
      
      const template = await storage.getWorkoutTemplateWithSections(templateId);
      if (!template) {
        return res.status(404).json({ message: "Workout template not found" });
      }
      
      res.json(template);
    } catch (error) {
      console.error("Error fetching workout template:", error);
      res.status(500).json({ message: "Failed to fetch workout template" });
    }
  });

  app.post("/api/workout-sessions/from-template", async (req, res) => {
    try {
      const { templateId, userId, enableCoaching, voiceEnabled, coachingStyle } = req.body;
      
      if (!templateId || !userId) {
        return res.status(400).json({ message: "Template ID and User ID are required" });
      }
      
      // Get the template with all its sections and exercises
      const template = await storage.getWorkoutTemplateWithSections(templateId);
      if (!template) {
        return res.status(404).json({ message: "Workout template not found" });
      }
      
      // Create a new workout session based on the template
      const workoutSession = await storage.startWorkoutSession({
        userId,
        workoutId: null, // Will be created separately
        workoutTemplateId: templateId, // Link to the template
        startedAt: new Date(),
        status: 'active',
        notes: `Started from template: ${template.name}`,
      });
      
      // Prepare workout info for coaching introduction
      const workoutInfo = {
        name: template.name,
        duration: template.estimatedDuration,
        exercises: template.sections.flatMap(section => 
          section.exercises.map(ex => ({
            name: ex.exercise.name,
            sets: ex.sets || undefined,
            workSeconds: ex.workSeconds || undefined,
            restSeconds: ex.restAfterExercise || undefined
          }))
        )
      };
      
      // Create coaching session if requested using shared helper
      await createCoachingSessionIfRequested(
        workoutSession.id, 
        { enableCoaching, voiceEnabled, coachingStyle },
        workoutInfo
      );
      
      // Note: Pre-built template workouts don't need workout or superset creation
      // The workout session references the template directly through notes
      // The frontend will use the template structure for workout flow
      
      res.json({
        workoutSession,
        template,
        message: "Workout session created successfully from template"
      });
    } catch (error) {
      console.error("Error creating workout session from template:", error);
      res.status(500).json({ message: "Failed to create workout session from template" });
    }
  });

  const httpServer = createServer(app);
  
  const wss = new WebSocketServer({ 
    server: httpServer,
    path: '/realtime'
  });
  
  setupRealtimeRelay(wss);
  console.log('🎙️ OpenAI Realtime API relay configured on /realtime');
  
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
  
  // Rule 6: Trainer-approved pairing logic (simplified and reliable)
  const isExactPair = isTrainerApprovedPair(exerciseA.name, exerciseB.name);
  
  // Core trainer principles: antagonist muscle pairing
  const isAntagonstPair = (
    (exerciseA.exerciseType === "Push" && exerciseB.exerciseType === "Pull") ||
    (exerciseA.exerciseType === "Pull" && exerciseB.exerciseType === "Push") ||
    (exerciseA.exerciseType === "Squat" && exerciseB.exerciseType === "Hinge") ||
    (exerciseA.exerciseType === "Hinge" && exerciseB.exerciseType === "Squat") ||
    (exerciseA.exerciseType === "Lunge" && exerciseB.exerciseType === "Hinge") ||
    (exerciseA.exerciseType === "Hinge" && exerciseB.exerciseType === "Lunge")
  );
  
  if (!isExactPair && !isAntagonstPair) {
    return { isValid: false, score: 0, reasoning: ["Trainer rule: Must be exact approved pair or antagonist muscle pattern"] };
  }
  
  // If all rules pass, assign score based on quality indicators
  let score = 2; // Base perfect score
  
  // Quality bonuses for trainer-approved combinations
  if (isExactPair) {
    reasons.push("Curated trainer-approved pairing");
  } else if (isAntagonstPair) {
    reasons.push("Antagonist muscle pairing");
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
  
  // 3. Enhanced Movement Pattern Opposition (30 points) - Using New System
  const patternA = mapToMovementPatternServer(exerciseA.exerciseType || '', exerciseA.name, exerciseA.equipment);
  const patternB = mapToMovementPatternServer(exerciseB.exerciseType || '', exerciseB.name, exerciseB.equipment);
  
  if (isOpposingMovementPattern(patternA, patternB)) {
    score += 30;
    // Provide specific movement pattern reasoning
    if ((patternA === 'horizontal_push' && patternB === 'horizontal_pull') || (patternA === 'horizontal_pull' && patternB === 'horizontal_push')) {
      reasons.push("Perfect push/pull balance (horizontal plane)");
    } else if ((patternA === 'vertical_push' && patternB === 'vertical_pull') || (patternA === 'vertical_pull' && patternB === 'vertical_push')) {
      reasons.push("Perfect push/pull balance (vertical plane)");
    } else if ((patternA === 'squat' && patternB === 'hinge') || (patternA === 'hinge' && patternB === 'squat')) {
      reasons.push("Perfect squat/hinge balance for complete lower body");
    } else if (patternA.includes('core') || patternB.includes('core')) {
      reasons.push("Upper body + core combination for active recovery");
    } else {
      reasons.push("Opposing movement patterns for balanced training");
    }
  }
  
  // 4. Enhanced Equipment Ecosystem Efficiency (up to 40 points with quality bonus)
  const { equipmentScore, equipmentReason } = calculateEquipmentEcosystemEfficiencyServer(exerciseA, exerciseB);
  score += equipmentScore;
  if (equipmentReason) {
    reasons.push(equipmentReason);
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

// Convert current Exercise Type to new Movement Pattern system (Server)
function mapToMovementPatternServer(exerciseType: string, exerciseName: string, equipment: string): string {
  const type = exerciseType?.toLowerCase() || '';
  const name = exerciseName?.toLowerCase() || '';
  const equip = equipment?.toLowerCase() || '';
  
  // Horizontal Push Pattern
  if (type === 'push' && (name.includes('bench') || name.includes('chest') || name.includes('press') && !name.includes('shoulder') && !name.includes('overhead'))) {
    return 'horizontal_push';
  }
  if (name.includes('push-up') || name.includes('pushup') || name.includes('dips') || name.includes('chest fly') || name.includes('pec deck')) {
    return 'horizontal_push';
  }
  
  // Horizontal Pull Pattern
  if (type === 'pull' && (name.includes('row') || name.includes('reverse fly') || name.includes('face pull') || name.includes('rear delt'))) {
    return 'horizontal_pull';
  }
  
  // Vertical Push Pattern
  if (type === 'push' && (name.includes('shoulder') || name.includes('overhead') || name.includes('military') || name.includes('pike'))) {
    return 'vertical_push';
  }
  if (name.includes('shoulder press') || name.includes('overhead press') || name.includes('pike push')) {
    return 'vertical_push';
  }
  
  // Vertical Pull Pattern
  if (type === 'pull' && (name.includes('pull-up') || name.includes('pullup') || name.includes('pulldown') || name.includes('lat') || name.includes('chin-up'))) {
    return 'vertical_pull';
  }
  if (name.includes('shrug') || name.includes('upright row')) {
    return 'vertical_pull';
  }
  
  // Squat Pattern
  if (type === 'squat' || name.includes('squat') || name.includes('leg press') || name.includes('wall sit')) {
    return 'squat';
  }
  
  // Hinge Pattern
  if (type === 'hinge' || name.includes('deadlift') || name.includes('hip hinge') || name.includes('hip thrust') || name.includes('glute bridge')) {
    return 'hinge';
  }
  if (name.includes('good morning') || name.includes('romanian') || name.includes('rdl')) {
    return 'hinge';
  }
  
  // Unilateral Pattern
  if (type === 'lunge' || name.includes('lunge') || name.includes('step-up') || name.includes('step up') || name.includes('single leg') || name.includes('bulgarian')) {
    return 'unilateral';
  }
  
  // Core/Stability Pattern
  if (name.includes('plank') || name.includes('dead bug') || name.includes('bird dog') || name.includes('pallof') || name.includes('anti-')) {
    return 'core';
  }
  if (name.includes('crunch') || name.includes('sit-up') || name.includes('russian twist') || name.includes('mountain climber')) {
    return 'core';
  }
  
  // Default mappings for current types
  switch (type) {
    case 'push': return 'horizontal_push';
    case 'pull': return 'horizontal_pull';
    case 'squat': return 'squat';
    case 'hinge': return 'hinge';
    case 'lunge': return 'unilateral';
    case 'accessory':
      // Smart accessory mapping based on name
      if (name.includes('curl') || name.includes('tricep') || name.includes('bicep')) {
        return name.includes('hammer') || name.includes('bicep') ? 'vertical_pull' : 'vertical_push';
      }
      if (name.includes('lateral') || name.includes('front raise')) return 'vertical_push';
      if (name.includes('calf')) return 'squat';
      return 'accessory';
    default: return 'general';
  }
}

function isOpposingMovementPattern(patternA: string, patternB: string): boolean {
  const opposingPairs = [
    ["horizontal_push", "horizontal_pull"],
    ["vertical_push", "vertical_pull"],
    ["squat", "hinge"],
    ["unilateral", "core"],
    ["horizontal_push", "core"],
    ["horizontal_pull", "core"],
    ["vertical_push", "core"],
    ["vertical_pull", "core"],
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

// Enhanced Equipment Ecosystem System for Server
function getEquipmentEcosystemServer(equipment: string): { type: string; canSupport: string[] } {
  const equipment_lower = equipment.toLowerCase();
  
  // Multi-Exercise Hubs (High Superset Potential)
  if (equipment_lower.includes('squat rack') || equipment_lower.includes('power rack') ||
      equipment_lower.includes('rig') || equipment_lower.includes('rack')) {
    return { type: 'rack_hub', canSupport: ['barbell', 'pullups', 'dumbbells', 'bodyweight', 'bands'] };
  }
  
  if ((equipment_lower.includes('bench') && equipment_lower.includes('barbell')) ||
      equipment_lower.includes('olympic bench')) {
    return { type: 'bench_barbell_hub', canSupport: ['barbell', 'dumbbells', 'bodyweight'] };
  }
  
  if (equipment_lower.includes('cable')) {
    return { type: 'cable_hub', canSupport: ['cable_variations', 'dumbbells', 'bodyweight', 'bands'] };
  }
  
  // Single Equipment + Portable Additions
  if (equipment_lower.includes('bench') && equipment_lower.includes('dumbbell')) {
    return { type: 'bench_dumbbell', canSupport: ['dumbbells', 'bodyweight'] };
  }
  
  if (equipment_lower.includes('dumbbell') && !equipment_lower.includes('bench')) {
    return { type: 'dumbbell_portable', canSupport: ['dumbbells', 'bodyweight', 'bands'] };
  }
  
  // Fixed Single-Exercise Equipment
  if (equipment_lower.includes('press machine') || equipment_lower.includes('leg press') ||
      equipment_lower.includes('pulldown') || equipment_lower.includes('curl machine') ||
      equipment_lower.includes('extension machine') || equipment_lower.includes('fly machine')) {
    return { type: 'fixed_machine', canSupport: ['dumbbells', 'bodyweight', 'bands'] };
  }
  
  // Bodyweight/Minimal Equipment
  if (equipment_lower.includes('bodyweight') || equipment_lower === 'bodyweight') {
    return { type: 'bodyweight', canSupport: ['bodyweight', 'bands', 'dumbbells'] };
  }
  
  // Default to portable
  return { type: 'portable', canSupport: ['bodyweight', 'bands'] };
}

function isPortableEquipmentServer(equipment: string): boolean {
  const equipment_lower = equipment.toLowerCase();
  return equipment_lower.includes('dumbbell') || 
         equipment_lower.includes('resistance band') ||
         equipment_lower.includes('bodyweight') ||
         equipment_lower.includes('kettlebell') ||
         equipment_lower.includes('medicine ball');
}

function getExerciseQualityScoreServer(equipment: string, exerciseType: string): number {
  const equipment_lower = equipment.toLowerCase();
  
  // Premium exercise quality (full range of motion, optimal setup)
  if (equipment_lower.includes('barbell') || equipment_lower.includes('dumbbell') ||
      equipment_lower.includes('cable')) {
    return 5; // High quality strength exercises (max 5 pts bonus)
  }
  
  // Excellent bodyweight exercises (full range, proven effectiveness)
  if (equipment_lower.includes('bodyweight') && 
      (exerciseType?.toLowerCase().includes('push') || exerciseType?.toLowerCase().includes('pull'))) {
    return 4; // Push-ups, pull-ups are excellent
  }
  
  // Good bodyweight exercises
  if (equipment_lower.includes('bodyweight')) {
    return 3; // Other bodyweight exercises
  }
  
  // Functional equipment
  if (equipment_lower.includes('band') || equipment_lower.includes('medicine ball')) {
    return 2; // Good accessory tools
  }
  
  // Default
  return 1;
}

function calculateEquipmentEcosystemEfficiencyServer(exerciseA: Exercise, exerciseB: Exercise): { equipmentScore: number; equipmentReason: string | null } {
  const ecosystemA = getEquipmentEcosystemServer(exerciseA.equipment);
  const ecosystemB = getEquipmentEcosystemServer(exerciseB.equipment);
  
  // Same equipment = maximum efficiency (35 pts)
  if (exerciseA.equipment === exerciseB.equipment) {
    const qualityBonus = getExerciseQualityScoreServer(exerciseB.equipment, exerciseB.exerciseType || '');
    return { 
      equipmentScore: 35 + qualityBonus, 
      equipmentReason: "Same equipment for seamless transitions" 
    };
  }
  
  // Equipment ecosystem compatibility (30 pts)
  if (ecosystemA.type === 'rack_hub') {
    if (exerciseB.equipment.toLowerCase().includes('barbell')) {
      const qualityBonus = getExerciseQualityScoreServer(exerciseB.equipment, exerciseB.exerciseType || '');
      return { 
        equipmentScore: 30 + qualityBonus, 
        equipmentReason: "Both exercises use the same rack setup" 
      };
    }
    if (exerciseB.equipment.toLowerCase().includes('pull-up')) {
      const qualityBonus = getExerciseQualityScoreServer(exerciseB.equipment, exerciseB.exerciseType || '');
      return { 
        equipmentScore: 30 + qualityBonus, 
        equipmentReason: "Rack supports both barbell and pull-up exercises" 
      };
    }
    if (exerciseB.equipment.toLowerCase().includes('dumbbell') || 
        exerciseB.equipment.toLowerCase().includes('bodyweight')) {
      const qualityBonus = getExerciseQualityScoreServer(exerciseB.equipment, exerciseB.exerciseType || '');
      return { 
        equipmentScore: 30 + qualityBonus, 
        equipmentReason: "Can add dumbbells/bodyweight exercises in rack area" 
      };
    }
  }
  
  if (ecosystemA.type === 'bench_barbell_hub' || ecosystemA.type === 'bench_dumbbell') {
    if (exerciseB.equipment.toLowerCase().includes('barbell') ||
        exerciseB.equipment.toLowerCase().includes('dumbbell') ||
        exerciseB.equipment.toLowerCase().includes('bodyweight')) {
      const qualityBonus = getExerciseQualityScoreServer(exerciseB.equipment, exerciseB.exerciseType || '');
      return { 
        equipmentScore: 30 + qualityBonus, 
        equipmentReason: "Can maximize bench utility with dumbbells/bodyweight" 
      };
    }
  }
  
  if (ecosystemA.type === 'cable_hub') {
    if (exerciseB.equipment.toLowerCase().includes('cable')) {
      const qualityBonus = getExerciseQualityScoreServer(exerciseB.equipment, exerciseB.exerciseType || '');
      return { 
        equipmentScore: 30 + qualityBonus, 
        equipmentReason: "Both use same cable station with different attachments" 
      };
    }
    if (exerciseB.equipment.toLowerCase().includes('dumbbell') || 
        exerciseB.equipment.toLowerCase().includes('bodyweight')) {
      const qualityBonus = getExerciseQualityScoreServer(exerciseB.equipment, exerciseB.exerciseType || '');
      return { 
        equipmentScore: 25 + qualityBonus, 
        equipmentReason: "Can add dumbbells/bodyweight beside cable station" 
      };
    }
  }
  
  // Fixed machine + portable addition (25 pts)
  if (ecosystemA.type === 'fixed_machine') {
    if (exerciseB.equipment.toLowerCase().includes('dumbbell')) {
      const qualityBonus = getExerciseQualityScoreServer(exerciseB.equipment, exerciseB.exerciseType || '');
      return { 
        equipmentScore: 25 + qualityBonus, 
        equipmentReason: "Can add dumbbell exercises beside machine (better than bodyweight for strength)" 
      };
    }
    if (exerciseB.equipment.toLowerCase().includes('bodyweight')) {
      const qualityBonus = getExerciseQualityScoreServer(exerciseB.equipment, exerciseB.exerciseType || '');
      return { 
        equipmentScore: 20 + qualityBonus, 
        equipmentReason: "Can add bodyweight exercises beside machine" 
      };
    }
    if (exerciseB.equipment.toLowerCase().includes('band')) {
      const qualityBonus = getExerciseQualityScoreServer(exerciseB.equipment, exerciseB.exerciseType || '');
      return { 
        equipmentScore: 15 + qualityBonus, 
        equipmentReason: "Can add resistance band exercises beside machine" 
      };
    }
  }
  
  // Portable equipment pairing (20 pts)
  if (isPortableEquipmentServer(exerciseA.equipment) && isPortableEquipmentServer(exerciseB.equipment)) {
    const qualityBonus = getExerciseQualityScoreServer(exerciseB.equipment, exerciseB.exerciseType || '');
    return { 
      equipmentScore: 20 + qualityBonus, 
      equipmentReason: "Both exercises use portable equipment" 
    };
  }
  
  // Poor efficiency - requires multiple major equipment pieces (5 pts)
  return { 
    equipmentScore: 5, 
    equipmentReason: "Poor gym etiquette - requires multiple equipment pieces" 
  };
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

