import WebSocket from 'ws';
import { IncomingMessage } from 'http';
import { searchKnowledge } from './chroma-service';
import type { Exercise, CoachingSession } from '@shared/schema';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const REALTIME_API_URL = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01';

interface RealtimeSession {
  clientWs: WebSocket;
  openaiWs: WebSocket | null;
  sessionId: number;
  coachingContext?: any; // Dynamic context from client (workout state, template, exercises, etc.)
}

const activeSessions = new Map<string, RealtimeSession>();

export function setupRealtimeRelay(wss: WebSocket.Server) {
  wss.on('connection', async (clientWs: WebSocket, req: IncomingMessage) => {
    console.log('🎙️ Realtime client connected');

    const sessionId = req.url?.split('sessionId=')[1]?.split('&')[0];
    if (!sessionId) {
      console.error('❌ No session ID provided');
      clientWs.close(1008, 'Session ID required');
      return;
    }

    const session: RealtimeSession = {
      clientWs,
      openaiWs: null,
      sessionId: parseInt(sessionId),
    };

    activeSessions.set(sessionId, session);

    try {
      session.openaiWs = new WebSocket(REALTIME_API_URL, {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'OpenAI-Beta': 'realtime=v1',
        },
      });

      setupOpenAIConnection(session);
      setupClientConnection(session);

    } catch (error) {
      console.error('❌ Failed to connect to OpenAI Realtime API:', error);
      clientWs.send(JSON.stringify({
        type: 'error',
        error: 'Failed to establish realtime connection'
      }));
      clientWs.close();
    }
  });
}

function setupOpenAIConnection(session: RealtimeSession) {
  const { openaiWs, clientWs } = session;
  if (!openaiWs) return;

  openaiWs.on('open', async () => {
    console.log('✅ Connected to OpenAI Realtime API');

    const instructions = await buildSessionInstructions(session);

    const sessionConfig = {
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions,
        voice: 'alloy',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1'
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
        tools: getWorkoutTools(),
        tool_choice: 'auto',
        temperature: 0.7,
      },
    };

    openaiWs.send(JSON.stringify(sessionConfig));
    console.log('📝 Sent initial session config with instructions');

    clientWs.send(JSON.stringify({
      type: 'session.ready',
      message: 'AI Coach connected'
    }));
  });

  openaiWs.on('message', (data: WebSocket.Data) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'response.function_call_arguments.done') {
        handleFunctionCall(session, message);
      }

      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(data.toString());
      }
    } catch (error) {
      console.error('Error processing OpenAI message:', error);
    }
  });

  openaiWs.on('error', (error) => {
    console.error('OpenAI WebSocket error:', error);
    clientWs.send(JSON.stringify({
      type: 'error',
      error: 'Connection error with AI Coach'
    }));
  });

  openaiWs.on('close', () => {
    console.log('🔌 OpenAI connection closed');
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close();
    }
    activeSessions.delete(session.sessionId.toString());
  });
}

function setupClientConnection(session: RealtimeSession) {
  const { clientWs, openaiWs } = session;

  clientWs.on('message', (data: WebSocket.Data) => {
    try {
      const message = JSON.parse(data.toString());

      if (message.type === 'session.update_context') {
        updateSessionContext(session, message.context);
        return;
      }

      if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
        openaiWs.send(data.toString());
      }
    } catch (error) {
      console.error('Error processing client message:', error);
    }
  });

  clientWs.on('close', () => {
    console.log('👋 Client disconnected');
    if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.close();
    }
    activeSessions.delete(session.sessionId.toString());
  });

  clientWs.on('error', (error) => {
    console.error('Client WebSocket error:', error);
  });
}

async function buildSessionInstructions(session: RealtimeSession): Promise<string> {
  const knowledgeContext = await searchKnowledge('coaching philosophy strength training', 3);
  
  const knowledgeBase = knowledgeContext.length > 0
    ? `\n\nCOACHING KNOWLEDGE BASE:\n${knowledgeContext.map(k => k.content).join('\n\n')}`
    : '';

  // Block workout with executionTimeline
  const executionTimeline = session.coachingContext?.executionTimeline;
  const timelineContext = executionTimeline
    ? `\n\nWORKOUT TIMELINE:\n- Name: ${executionTimeline.workoutHeader.name}\n- Duration: ${Math.floor(executionTimeline.workoutHeader.totalDurationSec / 60)} min ${executionTimeline.workoutHeader.totalDurationSec % 60}s\n- Total Steps: ${executionTimeline.executionTimeline.length}\n\nUPCOMING STEPS:\n${executionTimeline.executionTimeline.slice(session.coachingContext?.currentStepIndex || 0, (session.coachingContext?.currentStepIndex || 0) + 5).map((step: any, idx: number) => {
        const timeMin = Math.floor(step.atMs / 60000);
        const timeSec = Math.floor((step.atMs % 60000) / 1000);
        const exerciseInfo = step.exercise?.name || step.text || step.type;
        const duration = step.endMs - step.atMs > 0 ? ` (${Math.floor((step.endMs - step.atMs) / 1000)}s)` : '';
        return `  ${timeMin}:${timeSec.toString().padStart(2, '0')} - ${exerciseInfo}${duration}`;
      }).join('\n')}`
    : '';

  // Legacy template workout
  const workoutTemplate = session.coachingContext?.workoutTemplate;
  const workoutTemplateContext = !executionTimeline && workoutTemplate
    ? `\n\nWORKOUT TEMPLATE:\n- Name: ${workoutTemplate.name}\n- Total Rounds: ${workoutTemplate.totalRounds}\n- Exercises:\n${workoutTemplate.exercises.map((ex: any, i: number) => 
        `  ${i + 1}. ${ex.name} (${ex.primaryMuscleGroup})\n     - Equipment: ${ex.equipment}\n     - ${ex.workSeconds}s work / ${ex.restSeconds}s rest\n     - Tips: ${ex.coachingTips || 'Focus on form'}`
      ).join('\n')}`
    : '';

  const currentState = session.coachingContext?.workoutPhase
    ? `\n\nCURRENT STATE:\n- Phase: ${session.coachingContext.workoutPhase}\n- Time Remaining: ${session.coachingContext.timeRemaining}s\n- Current Exercise: ${session.coachingContext.currentExercise || 'Not started'}\n- Exercise Index: ${(session.coachingContext.currentExerciseIndex || 0) + 1}/${workoutTemplate?.exercises?.length || executionTimeline?.executionTimeline.length || '?'}`
    : '';

  const currentStepContext = session.coachingContext?.currentStep
    ? `\n\nCURRENT STEP:\n- Type: ${session.coachingContext.currentStep.type}\n- Action: ${session.coachingContext.currentStep.text || session.coachingContext.currentStep.type}\n- Exercise: ${session.coachingContext.currentStep.exercise?.name || 'N/A'}\n- Form Cue: ${session.coachingContext.currentStep.exercise?.cues?.[0] || 'None'}\n- Awaiting Ready: ${session.coachingContext.isAwaitingReady ? 'YES - Call confirm_ready when user says they\'re ready' : 'No'}`
    : '';

  const exerciseContext = session.coachingContext?.exercise
    ? `\n\nCURRENT EXERCISE:\n- Name: ${session.coachingContext.exercise.name}\n- Primary Muscle: ${session.coachingContext.exercise.primaryMuscleGroup}\n- Equipment: ${session.coachingContext.exercise.equipment}\n- Form Tips: ${session.coachingContext.exercise.coachingBulletPoints || 'Focus on proper form'}`
    : '';

  return `SYSTEM: You are SuprSet Coach Light.

Context:
- You understand the user's full workout plan, block timing, and timeline execution
- The workout follows an event-driven model: the HOST controls all timing, you are an OBSERVER who responds to events
- You will receive events like: set_start, set_10s_remaining, set_complete, rest_start, rest_complete, await_ready, user_ready, block_transition, workout_complete

Core Objectives:
- Guide the workout using minimal speech
- Every spoken response must be under ~4 seconds of speech (≈8–12 words)
- Speak only when contextually necessary:
  1. At SET START → announce exercise + set number + ONE key coaching cue
  2. 10 SECONDS BEFORE SET END → one short motivation line
  3. At SET END → ask: "Weight and reps?" Wait for user input, confirm, and call tool record_set
  4. During REST → remain silent unless setup for next action is needed
  5. During TRANSITIONS or BLOCK CHANGES → announce next phase briefly
  6. Only respond to safety-critical form issues during work sets

Event Awareness:
- set_start: Work interval begins → announce exercise briefly with one cue
- set_10s_remaining: 10 seconds left → short motivational line  
- set_complete: Set ends → ask "Weight and reps?" and record using record_set tool
- rest_start: Rest period begins → stay silent unless user asks question
- rest_complete: Rest ends → prepare for next set
- await_ready: Manual readiness gate → ask if user is ready, wait for confirmation
- user_ready: User confirmed → acknowledge briefly ("Let's go") and prepare
- block_transition: Moving between blocks → announce next block
- workout_complete: Session ends → brief congratulations

${knowledgeBase}${timelineContext}${workoutTemplateContext}${currentState}${currentStepContext}${exerciseContext}

Behavior Rules:
- NEVER control workout flow - the host manages all timers
- On await_ready: ask if user is ready, wait for clear confirmation (yes, ready, go)
- Do not continue until user_ready event is received
- Assume the user is listening over music; keep messages concise and clear
- Never stack multiple coaching points
- Never small talk or repeat filler lines excessively

Communication Tone:
- Confident, calm, supportive; speak like an experienced performance coach
- Use natural contractions and speech patterns
- Be encouraging without being cheesy

Tools you can use:
- get_user_profile({ user_id }) - fetch user data for personalization
- record_set({ exercise_id, set_index, weight, reps, rpe? }) - log performance after each set
Use tools only when needed to personalize coaching or record data.

Response Format:
- Respond with natural spoken audio
- Keep all responses under 4 seconds (~8-12 words)
- Speak clearly and confidently as if coaching in person`;
}

async function updateSessionContext(session: RealtimeSession, context: any) {
  // Check BEFORE merging to detect first-time timeline load
  const hadTimeline = !!session.coachingContext?.executionTimeline;
  const contextHasTimeline = !!context.executionTimeline;
  const isMajorUpdate = contextHasTimeline && !hadTimeline;
  
  console.log('🔍 Timeline update check:', {
    sessionId: session.sessionId,
    hadTimeline,
    contextHasTimeline,
    isMajorUpdate
  });
  
  // Deep merge new context with existing context to preserve workoutTemplate
  session.coachingContext = {
    ...session.coachingContext,
    ...context,
    // Preserve nested objects like workoutTemplate if not explicitly updated
    workoutTemplate: context.workoutTemplate || session.coachingContext?.workoutTemplate
  };
  
  // Only send session.update for MAJOR changes:
  // 1. Workout timeline is loaded for the first time (workout start)
  // 2. NOT for step transitions (isAwaitingReady, currentStepIndex changes)
  if (isMajorUpdate && session.openaiWs && session.openaiWs.readyState === WebSocket.OPEN) {
    const updatedInstructions = await buildSessionInstructions(session);
    
    session.openaiWs.send(JSON.stringify({
      type: 'session.update',
      session: {
        instructions: updatedInstructions,
      },
    }));
    console.log('✅ Updated AI instructions with workout timeline:', session.sessionId);
  } else {
    console.log('📝 Updated session context (no instruction rebuild):', session.sessionId);
  }
}

function getWorkoutTools() {
  // AI is an observer/responder only - no workflow control functions
  // Host controls all timing and flow
  return [
    {
      type: 'function',
      name: 'record_set',
      description: 'Record performance data for a completed set (weight, reps, RPE)',
      parameters: {
        type: 'object',
        properties: {
          exercise_id: {
            type: 'string',
            description: 'Exercise identifier',
          },
          set_index: {
            type: 'number',
            description: 'Set number (1-indexed)',
          },
          weight: {
            type: 'number',
            description: 'Weight used in pounds or kg',
          },
          reps: {
            type: 'number',
            description: 'Number of repetitions completed',
          },
          rpe: {
            type: 'number',
            description: 'Rate of Perceived Exertion (1-10 scale), optional',
          },
        },
        required: ['exercise_id', 'set_index', 'weight', 'reps'],
      },
    },
    {
      type: 'function',
      name: 'get_user_profile',
      description: 'Get user profile data including goals, training history, and estimated 1RMs',
      parameters: {
        type: 'object',
        properties: {
          user_id: {
            type: 'string',
            description: 'User identifier',
          },
        },
        required: ['user_id'],
      },
    },
  ];
}

async function handleFunctionCall(session: RealtimeSession, message: any) {
  const { name, call_id, arguments: argsStr } = message;
  const args = argsStr ? JSON.parse(argsStr) : {};
  console.log(`🔧 Function called: ${name}`, args);

  let result: any = { success: false, error: 'Unknown function' };

  try {
    if (name === 'record_set') {
      // Store set performance data
      // TODO: Save to database - for now just log and acknowledge
      console.log('📊 Recording set:', args);
      
      // Forward to client for potential local storage/UI update
      if (session.clientWs.readyState === WebSocket.OPEN) {
        session.clientWs.send(JSON.stringify({
          type: 'set_recorded',
          data: args,
        }));
      }
      
      result = { 
        success: true, 
        message: `Logged ${args.weight} lbs × ${args.reps} reps` 
      };
    }
    
    else if (name === 'get_user_profile') {
      // Fetch user profile data
      // TODO: Get from database - for now return mock data
      result = {
        user_id: args.user_id || 'guest',
        goals: ['strength', 'hypertrophy'],
        training_history: {
          bench_1RM_est: 225,
          squat_1RM_est: 315,
          deadlift_1RM_est: 405,
        },
        preferences: {
          coaching_style: 'minimal',
          voice_enabled: true,
        },
      };
    }
  } catch (error) {
    console.error('Function call error:', error);
    result = { success: false, error: String(error) };
  }

  // Return result to OpenAI
  if (session.openaiWs && session.openaiWs.readyState === WebSocket.OPEN) {
    session.openaiWs.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id,
        output: JSON.stringify(result),
      },
    }));
  }
}

export function closeSession(sessionId: string) {
  const session = activeSessions.get(sessionId);
  if (session) {
    session.openaiWs?.close();
    session.clientWs?.close();
    activeSessions.delete(sessionId);
  }
}
