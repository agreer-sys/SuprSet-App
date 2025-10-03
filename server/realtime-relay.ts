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

  const workoutTemplate = session.coachingContext?.workoutTemplate;
  const workoutTemplateContext = workoutTemplate
    ? `\n\nWORKOUT TEMPLATE:\n- Name: ${workoutTemplate.name}\n- Total Rounds: ${workoutTemplate.totalRounds}\n- Exercises:\n${workoutTemplate.exercises.map((ex: any, i: number) => 
        `  ${i + 1}. ${ex.name} (${ex.primaryMuscleGroup})\n     - Equipment: ${ex.equipment}\n     - ${ex.workSeconds}s work / ${ex.restSeconds}s rest\n     - Tips: ${ex.coachingTips || 'Focus on form'}`
      ).join('\n')}`
    : '';

  const currentState = session.coachingContext?.workoutPhase
    ? `\n\nCURRENT STATE:\n- Phase: ${session.coachingContext.workoutPhase}\n- Time Remaining: ${session.coachingContext.timeRemaining}s\n- Current Exercise: ${session.coachingContext.currentExercise || 'Not started'}\n- Exercise Index: ${(session.coachingContext.currentExerciseIndex || 0) + 1}/${workoutTemplate?.exercises?.length || '?'}`
    : '';

  const exerciseContext = session.coachingContext?.exercise
    ? `\n\nCURRENT EXERCISE:\n- Name: ${session.coachingContext.exercise.name}\n- Primary Muscle: ${session.coachingContext.exercise.primaryMuscleGroup}\n- Equipment: ${session.coachingContext.exercise.equipment}\n- Form Tips: ${session.coachingContext.exercise.coachingBulletPoints || 'Focus on proper form'}`
    : '';

  return `You are SuprSet AI Coach, a professional strength training coach specializing in superset workouts. You have a natural, conversational tone like a real personal trainer working with someone in the gym.

PERSONALITY:
- Energetic but not over-the-top
- Use contractions and natural speech patterns
- Keep responses concise (1-3 sentences for quick questions)
- Be encouraging without being cheesy
- Reference the specific exercise and workout context naturally

CAPABILITIES:
- Provide form cues and technique advice
- Give motivational encouragement between sets
- Answer questions about exercise execution
- Control workout flow (start/pause/resume timers)
- Track progress and suggest adjustments

${knowledgeBase}${workoutTemplateContext}${currentState}${exerciseContext}

IMPORTANT:
- This is voice-only conversation, so be conversational and brief
- Listen for workout control commands (pause, resume, ready)
- Call functions when user needs timer control or workout flow changes
- Don't repeat information unnecessarily - they can hear you clearly`;
}

async function updateSessionContext(session: RealtimeSession, context: any) {
  // Deep merge new context with existing context to preserve workoutTemplate
  session.coachingContext = {
    ...session.coachingContext,
    ...context,
    // Preserve nested objects like workoutTemplate if not explicitly updated
    workoutTemplate: context.workoutTemplate || session.coachingContext?.workoutTemplate
  };
  
  // Rebuild instructions with new context and push to OpenAI
  if (session.openaiWs && session.openaiWs.readyState === WebSocket.OPEN) {
    const updatedInstructions = await buildSessionInstructions(session);
    
    session.openaiWs.send(JSON.stringify({
      type: 'session.update',
      session: {
        instructions: updatedInstructions,
      },
    }));
  }
  
  console.log('📝 Updated session context for session:', session.sessionId);
}

function getWorkoutTools() {
  return [
    {
      type: 'function',
      name: 'pause_workout',
      description: 'Pause the current workout timer and exercise',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
    {
      type: 'function',
      name: 'resume_workout',
      description: 'Resume the paused workout',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
    {
      type: 'function',
      name: 'start_countdown',
      description: 'Start a 10-second countdown before beginning exercise',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
    {
      type: 'function',
      name: 'start_rest_timer',
      description: 'Start a rest period timer',
      parameters: {
        type: 'object',
        properties: {
          duration: {
            type: 'number',
            description: 'Rest duration in seconds (default: 30)',
          },
        },
      },
    },
    {
      type: 'function',
      name: 'next_exercise',
      description: 'Move to the next exercise in the workout',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  ];
}

async function handleFunctionCall(session: RealtimeSession, message: any) {
  const { name, call_id, arguments: args } = message;
  console.log(`🔧 Function called: ${name}`, args);

  if (session.clientWs.readyState === WebSocket.OPEN) {
    session.clientWs.send(JSON.stringify({
      type: 'function_call',
      function: name,
      arguments: args ? JSON.parse(args) : {},
      call_id,
    }));
  }

  if (session.openaiWs && session.openaiWs.readyState === WebSocket.OPEN) {
    session.openaiWs.send(JSON.stringify({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id,
        output: JSON.stringify({ success: true }),
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
