/**
 * LangChain AI Coach Service
 * 
 * Provides intelligent workout coaching with state management, conversation memory,
 * timer integration, and OpenAI-powered responses for SuprSet workouts.
 */

import OpenAI from 'openai';
import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import type { Exercise, CoachingSession } from '@shared/schema';

// Initialize OpenAI clients
// Using GPT-3.5-turbo for cost efficiency during development and testing
const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

const llm = new ChatOpenAI({
  model: "gpt-3.5-turbo",
  apiKey: process.env.OPENAI_API_KEY,
  temperature: 0.7
});

interface WorkoutState {
  currentExercise?: Exercise;
  currentSet: number;
  totalSets: number;
  isRestPeriod: boolean;
  restTimeRemaining?: number;
  workoutPhase: 'warmup' | 'working' | 'cooldown';
  supersetProgress: {
    exerciseA: { sets: number; reps?: number; weight?: number };
    exerciseB: { sets: number; reps?: number; weight?: number };
  };
}

interface CoachingContext {
  coaching: CoachingSession;
  workoutState: WorkoutState;
  exercise?: Exercise;
  sessionHistory: Array<{ role: string; content: string; timestamp: string }>;
}

export class LangChainAICoach {
  private conversationHistory: Map<number, Array<{ role: 'user' | 'assistant' | 'system'; content: string }>> = new Map();

  /**
   * Initialize coaching session 
   */
  async initializeCoachingSession(coaching: CoachingSession): Promise<void> {
    const history: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = [];

    // Load existing conversation history
    if (coaching.messages && coaching.messages.length > 0) {
      for (const msg of coaching.messages) {
        history.push({
          role: msg.role,
          content: msg.content
        });
      }
    }

    this.conversationHistory.set(coaching.id, history);
  }

  /**
   * Generate coaching response using LangChain with context awareness
   */
  async generateCoachingResponse(
    userMessage: string,
    context: CoachingContext
  ): Promise<{ message: string, shouldPause?: boolean, shouldResume?: boolean, startCountdown?: boolean }> {
    const { coaching, workoutState, exercise } = context;
    
    // Detect workout control commands
    const commandDetection = this.detectWorkoutCommand(userMessage);
    
    // Ensure coaching session is initialized
    if (!this.conversationHistory.has(coaching.id)) {
      await this.initializeCoachingSession(coaching);
    }

    const history = this.conversationHistory.get(coaching.id)!;
    
    try {
      // Build messages for LangChain
      const messages = [];
      
      // System message with context
      const systemPrompt = this.buildSystemPrompt(coaching.preferredStyle as 'motivational' | 'technical' | 'casual', workoutState, exercise);
      messages.push(new SystemMessage(systemPrompt));
      
      // Add conversation history
      for (const msg of history.slice(-10)) { // Keep last 10 messages for context
        if (msg.role === 'user') {
          messages.push(new HumanMessage(msg.content));
        } else if (msg.role === 'assistant') {
          messages.push(new AIMessage(msg.content));
        }
      }
      
      // Add current user message
      messages.push(new HumanMessage(userMessage));
      
      // Get response from LangChain
      const response = await llm.invoke(messages);
      
      // Store the conversation
      history.push({ role: 'user', content: userMessage });
      history.push({ role: 'assistant', content: response.content as string });
      
      const processedMessage = this.processCoachingResponse(response.content as string, context);
      
      return {
        message: processedMessage,
        shouldPause: commandDetection.shouldPause,
        shouldResume: commandDetection.shouldResume,
        startCountdown: commandDetection.startCountdown
      };
    } catch (error) {
      console.error('LangChain coaching error:', error);
      return {
        message: this.getFallbackResponse(userMessage, context),
        shouldPause: commandDetection.shouldPause,
        shouldResume: commandDetection.shouldResume,
        startCountdown: commandDetection.startCountdown
      };
    }
  }

  /**
   * Build system prompt based on preferred style and context
   */
  private buildSystemPrompt(style: 'motivational' | 'technical' | 'casual', workoutState: WorkoutState, exercise?: Exercise): string {
    const stylePrompts = {
      motivational: "You are an energetic, supportive personal trainer who knows the user personally. Use their name occasionally, celebrate small wins, and inject humor when appropriate. Speak naturally like you're in the gym together - use contractions (you're, let's, we're), exclamations, and casual phrases. Keep it concise but genuinely enthusiastic.",
      technical: "You are an experienced strength coach who explains things clearly without jargon overload. Break down form cues into simple, actionable steps. Use analogies to make biomechanics relatable. Speak conversationally but precisely - like a knowledgeable friend who happens to be an expert.",
      casual: "You are their favorite workout buddy who keeps things light but effective. Use casual language, throw in encouragement naturally, and don't be afraid of a well-placed 'let's go!' or 'crushing it!'. Keep responses short and conversational - like texting between sets."
    };

    const workoutContext = this.formatWorkoutContext(workoutState, exercise);

    return `You are SuprSet AI, a professional strength training coach specializing in superset workouts. ${stylePrompts[style]}

CURRENT WORKOUT CONTEXT:
${workoutContext}

COACHING GUIDELINES:
- Keep responses under 150 words for voice mode, 250 words for text
- Reference current exercise and workout state when relevant
- Provide actionable advice for the current situation
- If asked about form, reference specific technique points
- For timer requests, acknowledge and provide guidance
- For rep/weight questions, ask for specifics and provide feedback
- Stay focused on the current superset and workout goals

WORKOUT CONTROL COMMANDS:
- If user says "STOP", "PAUSE", "HOLD", or "WAIT": Acknowledge immediately and confirm the workout is paused
- If user says "START", "RESUME", "GO", or "CONTINUE": Encourage them and confirm workout is resuming
- If user says "READY": Trigger the countdown to start/resume workout`;
  }


  /**
   * Format current workout state for context
   */
  private formatWorkoutContext(workoutState: WorkoutState, exercise?: Exercise): string {
    const context = [];
    
    if (exercise) {
      context.push(`Current Exercise: ${exercise.name}`);
      context.push(`Primary Muscle: ${exercise.primaryMuscleGroup}`);
      context.push(`Equipment: ${exercise.equipment}`);
    }
    
    context.push(`Current Set: ${workoutState.currentSet}/${workoutState.totalSets}`);
    context.push(`Workout Phase: ${workoutState.workoutPhase}`);
    
    if (workoutState.isRestPeriod && workoutState.restTimeRemaining) {
      context.push(`Rest Time Remaining: ${workoutState.restTimeRemaining}s`);
    }
    
    return context.join(' | ');
  }

  /**
   * Detect workout control commands from user message
   */
  private detectWorkoutCommand(userMessage: string): { 
    command: 'pause' | 'resume' | 'ready' | null, 
    shouldPause: boolean,
    shouldResume: boolean,
    startCountdown: boolean
  } {
    const message = userMessage.toLowerCase().trim();
    
    // Pause commands
    if (/(^|\s)(stop|pause|hold|wait)(\s|$|!|\.)/.test(message)) {
      return { command: 'pause', shouldPause: true, shouldResume: false, startCountdown: false };
    }
    
    // Resume commands
    if (/(^|\s)(start|resume|go|continue|let's go)(\s|$|!|\.)/.test(message)) {
      return { command: 'resume', shouldPause: false, shouldResume: true, startCountdown: false };
    }
    
    // Ready command (triggers countdown)
    if (/(^|\s)(ready|i'm ready|let's do this)(\s|$|!|\.)/.test(message)) {
      return { command: 'ready', shouldPause: false, shouldResume: false, startCountdown: true };
    }
    
    return { command: null, shouldPause: false, shouldResume: false, startCountdown: false };
  }

  /**
   * Process and enhance the LangChain response
   */
  private processCoachingResponse(response: string, context: CoachingContext): string {
    // Clean up any template artifacts
    let processedResponse = response
      .replace(/\[WORKOUT_CONTEXT:.*?\]/g, '')
      .trim();

    // Add workout-specific enhancements based on context
    if (context.workoutState.isRestPeriod) {
      processedResponse = this.enhanceRestPeriodResponse(processedResponse, context);
    }

    return processedResponse;
  }

  /**
   * Enhance responses during rest periods with timer guidance
   */
  private enhanceRestPeriodResponse(response: string, context: CoachingContext): string {
    const { restTimeRemaining } = context.workoutState;
    
    if (restTimeRemaining && restTimeRemaining < 30) {
      return `${response}\n\n⏰ Get ready - only ${restTimeRemaining} seconds left in your rest!`;
    }
    
    return response;
  }

  /**
   * Fallback response system for errors
   */
  private getFallbackResponse(userMessage: string, context: CoachingContext): string {
    const message = userMessage.toLowerCase();
    const { workoutState, exercise } = context;
    
    if (message.includes('form') || message.includes('technique')) {
      if (exercise?.coachingBulletPoints) {
        const tips = exercise.coachingBulletPoints
          .split(',')
          .slice(0, 2)
          .map(tip => tip.trim())
          .join('. ');
        return `Focus on proper form: ${tips}.`;
      } else {
        return "Keep your core tight, maintain proper posture, and focus on controlled movements.";
      }
    }
    
    if (message.includes('rest') || message.includes('time')) {
      return workoutState.isRestPeriod 
        ? "Take your time to recover properly. Use this rest to prepare mentally for your next set."
        : "You're doing great! Stay focused on your current set.";
    }
    
    if (message.includes('reps') || message.includes('weight')) {
      return "How many reps did you complete? And what weight are you using? I can help you adjust for your next set.";
    }
    
    return "I'm here to help you crush this workout! What do you need guidance on?";
  }

  /**
   * Voice transcription using OpenAI Whisper
   */
  async transcribeAudio(audioBuffer: Buffer): Promise<string> {
    try {
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');
      
      // Create temporary file for audio processing
      const tempDir = os.tmpdir();
      const tempFilePath = path.join(tempDir, `audio_${Date.now()}.webm`);
      
      // Write buffer to temporary file
      fs.writeFileSync(tempFilePath, audioBuffer);
      
      // Create stream for OpenAI
      const fileStream = fs.createReadStream(tempFilePath);
      
      const transcription = await openai.audio.transcriptions.create({
        file: fileStream,
        model: 'whisper-1',
        language: 'en'
      });
      
      // Clean up temporary file
      fs.unlinkSync(tempFilePath);
      
      return transcription.text;
    } catch (error) {
      console.error('Audio transcription error:', error);
      throw new Error('Failed to transcribe audio');
    }
  }

  /**
   * Generate speech from text response
   */
  async generateSpeech(text: string, voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer' = 'nova'): Promise<ArrayBuffer> {
    try {
      const response = await openai.audio.speech.create({
        model: 'tts-1',
        voice,
        input: text,
        speed: 1.0
      });
      
      return await response.arrayBuffer();
    } catch (error) {
      console.error('Speech generation error:', error);
      throw new Error('Failed to generate speech');
    }
  }

  /**
   * Timer integration tools for LangChain
   */
  getTimerTools() {
    return [
      {
        name: 'start_rest_timer',
        description: 'Start a rest timer for the specified duration in seconds',
        parameters: {
          type: 'object',
          properties: {
            duration: {
              type: 'number',
              description: 'Rest duration in seconds'
            }
          }
        }
      },
      {
        name: 'start_work_timer',
        description: 'Start a work timer for exercise duration',
        parameters: {
          type: 'object',
          properties: {
            duration: {
              type: 'number',
              description: 'Work period duration in seconds'
            }
          }
        }
      },
      {
        name: 'pause_timer',
        description: 'Pause the current timer'
      },
      {
        name: 'resume_timer',
        description: 'Resume the paused timer'
      }
    ];
  }

  /**
   * Clean up conversation history for completed sessions
   */
  cleanupSession(sessionId: number): void {
    this.conversationHistory.delete(sessionId);
  }
}

// Export singleton instance
export const langchainCoach = new LangChainAICoach();