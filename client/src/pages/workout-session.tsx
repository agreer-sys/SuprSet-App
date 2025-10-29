import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  Play, Pause, Square, MessageSquare, Send, Timer, 
  CheckCircle, Circle, Dumbbell, Brain, Volume2, VolumeX, Mic, MicOff 
} from "lucide-react";
import { useRealtimeVoice } from '@/hooks/useRealtimeVoice';
import type { WorkoutSessionNew, SetLog, CoachingSession } from "@shared/schema";
import { onEvent } from '@/coach/observer';
import { seedResponses } from '@/coach/responseService';
import { beeps } from '@/coach/beeps';
import { PreflightWeightsSheet } from '@/components/PreflightWeightsSheet';
import { WorkoutIntroSheet } from '@/components/WorkoutIntroSheet';
import type { ChatterLevel as IntroChatterLevel } from '@/components/WorkoutIntroSheet';
import type { TimelineContext, ChatterLevel, Event } from '@/types/coach';
import { FLAGS } from '@/config/flags';

export default function WorkoutSessionPage() {
  const [currentExercise, setCurrentExercise] = useState<'A' | 'B'>('A');
  const [currentSet, setCurrentSet] = useState(1);
  const [templateExerciseIndex, setTemplateExerciseIndex] = useState(0);
  const [currentWorkExerciseIndex, setCurrentWorkExerciseIndex] = useState(0); // Tracks which exercise is currently being worked
  const [workTimer, setWorkTimer] = useState(0);
  const [isWorking, setIsWorking] = useState(false);
  const [restTimer, setRestTimer] = useState(0);
  const [isResting, setIsResting] = useState(false);
  const [coachingMessage, setCoachingMessage] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{role: 'user' | 'assistant', content: string, timestamp: string}>>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(true); // Enable voice by default for coach dictation
  const [isPaused, setIsPaused] = useState(false);
  const pausedState = useRef<{phase: 'work' | 'rest' | 'countdown' | null, timeRemaining: number}>({ phase: null, timeRemaining: 0 });
  const hasLoadedInitialMessages = useRef(false);
  const hasSentWorkoutTemplate = useRef(false);
  const lastWorkAnnouncement = useRef<number | null>(null);
  const lastRestAnnouncement = useRef<number | null>(null);
  const queryClient = useQueryClient();

  // Timeline execution state for block workouts
  const [workoutStartEpochMs, setWorkoutStartEpochMs] = useState<number | null>(null);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isAwaitingReady, setIsAwaitingReady] = useState(false);
  const lastResyncMs = useRef(0);
  const timerRef = useRef<number | null>(null);
  const pauseStartMs = useRef<number | null>(null);
  const totalPausedMs = useRef(0);
  const lastUpdateWallClockMs = useRef<number>(0);

  // NEW: Coach system setup
  const [chatterLevel, setChatterLevel] = useState<ChatterLevel>('minimal');
  const [repPaceSec, setRepPaceSec] = useState<number>(180);
  const [plannedLoads, setPlannedLoads] = useState<Record<string, number|undefined>>({});
  const [showIntro, setShowIntro] = useState(false); // Show intro first for block workouts
  const [showPreflight, setShowPreflight] = useState(false); // Only show for block workouts
  const [preflightCompleted, setPreflightCompleted] = useState(false); // Track if preflight was completed

  // Fetch active workout session - try block workout first, then fall back to template
  const { data: blockSession, isLoading: isLoadingBlock } = useQuery<any>({
    queryKey: ['/api/block-workout-sessions/active'],
    retry: false, // Don't retry on 404
    queryFn: async () => {
      try {
        const response = await fetch('/api/block-workout-sessions/active', {
          credentials: 'include'
        });
        if (response.status === 404) {
          return null; // No active block session
        }
        if (!response.ok) {
          throw new Error('Failed to fetch block workout session');
        }
        return response.json();
      } catch (error) {
        console.log('No active block workout session');
        return null;
      }
    }
  });

  // Fallback to template-based workout if no block workout session
  const { data: templateSession, isLoading: isLoadingTemplate } = useQuery<any>({
    queryKey: ['/api/workout-sessions/active'],
    enabled: blockSession === null, // Only fetch if block session explicitly returned null
  });
  
  const isLoading = isLoadingBlock || (blockSession === null && isLoadingTemplate);

  // Use block session if available, otherwise template session
  const session = blockSession || templateSession;
  const isBlockWorkout = !!blockSession;
  const executionTimeline = blockSession?.executionTimelineSnapshot || blockSession?.blockWorkout?.executionTimeline;
  
  // DEBUG: Log the session and timeline data
  useEffect(() => {
    if (blockSession) {
      console.log('🔍 Block session data:', {
        id: blockSession.id,
        hasSnapshot: !!blockSession.executionTimelineSnapshot,
        hasBlockWorkout: !!blockSession.blockWorkout,
        hasBlockWorkoutTimeline: !!blockSession.blockWorkout?.executionTimeline,
        executionTimeline: executionTimeline ? 'LOADED' : 'MISSING'
      });
    }
  }, [blockSession, executionTimeline]);


  // Memoize templateExercises to prevent infinite loop - only recreate when session data changes
  const templateExercises = useMemo(() => {
    return session?.workoutTemplate?.sections?.flatMap((section: any) => 
      section.exercises || []
    ) || [];
  }, [session?.workoutTemplate?.sections]);
  
  const currentTemplateExercise = templateExercises.length > 0 
    ? templateExercises[currentWorkExerciseIndex % templateExercises.length]
    : null;
  
  const isTemplateWorkout = !!session?.workoutTemplate;

  // Fetch coaching session
  const { data: coaching } = useQuery<CoachingSession>({
    queryKey: [`/api/coaching/${session?.id}`],
    enabled: !!session?.id,
  });

  // NEW: Extract exercises from timeline for coach context
  const exercises = useMemo(() => {
    if (!executionTimeline) return [];
    const exerciseMap = new Map();
    executionTimeline.executionTimeline?.forEach((step: any) => {
      if (step.exercise) {
        exerciseMap.set(step.exercise.id.toString(), {
          id: step.exercise.id.toString(),
          name: step.exercise.name,
          cues: step.exercise.cues || [],
          equipment: step.exercise.equipment || [],
          muscleGroup: step.exercise.muscleGroup || '',
          videoUrl: step.exercise.videoUrl,
          imageUrl: step.exercise.imageUrl,
          estimatedTimeSec: step.exercise.estimatedTimeSec || 45
        });
      }
    });
    return Array.from(exerciseMap.values());
  }, [executionTimeline]);

  // NEW: Auto-show intro when block workout is detected (only once)
  useEffect(() => {
    if (isBlockWorkout && exercises.length > 0 && !preflightCompleted && !showIntro && !showPreflight) {
      setShowIntro(true);
    }
  }, [isBlockWorkout, exercises.length, preflightCompleted]); // Removed showIntro and showPreflight from deps to prevent fighting with button clicks

  // OpenAI Realtime API setup (needs to be before coachContext)
  const handleTranscript = useCallback((transcript: string, isFinal: boolean) => {
    setCoachingMessage(transcript);
    if (isFinal && transcript.trim()) {
      setChatMessages(prev => [...prev, {
        role: 'user',
        content: transcript,
        timestamp: new Date().toISOString()
      }]);
    }
  }, []);

  const handleRealtimeError = useCallback((error: string) => {
    console.error('Realtime API error:', error);
  }, []);

  const realtime = useRealtimeVoice({
    sessionId: session?.id || 0,
    onTranscript: handleTranscript,
    onError: handleRealtimeError,
  });

  // NEW: Build TimelineContext for the observer
  const coachContext = useMemo<TimelineContext>(() => {
    // Build blocks array from executionTimeline params
    const blocks = executionTimeline ? [{
      id: 'block-1',
      params: executionTimeline.params || {},
      exerciseIds: exercises.map(e => e.id)
    }] : [];

    return {
      workoutId: session?.id?.toString() || 'unknown',
      pattern: executionTimeline?.params?.pattern || 'superset',
      mode: executionTimeline?.params?.mode || 'reps',
      chatterLevel,
      prefs: { 
        preflightLoadIntake: true, 
        strictEMOM: true, 
        allowAutoExtendRest: false, 
        rpeLabels: 'words',
        repPaceSec
      },
      blocks,
      exercises,
      plannedLoads,
    nowMs: () => Date.now(),
    getExerciseName: (id) => exercises.find(e => e.id === id)?.name || 'Exercise',
    getNextExerciseName: () => undefined,
    getExerciseMeta: (id) => {
      const e = exercises.find(x => x.id === id) as any;
      return e
        ? { id: e.id, name: e.name, cues: e.cues||[], equipment: e.equipment||[], muscleGroup: e.muscleGroup||'', estimatedTimeSec: e.estimatedTimeSec }
        : { id, name: 'Exercise', cues: [], equipment: [], muscleGroup: '', estimatedTimeSec: 45 };
    },
    beep: undefined, // Beeps handled by existing timeline player
    showReadyModal: () => new Promise<void>(res => { if (window.confirm('Ready?')) res(); }),
    speak: (text) => {
      // NEW: Route to Realtime TTS instead of console
      realtime.speakDirectly(text);
      // Also add to chat for visual feedback
      setChatMessages(prev => [...prev, { 
        role: 'assistant', 
        content: text, 
        timestamp: new Date().toISOString() 
      }]);
    },
      caption: (text) => console.log('[COACH CAPTION]', text),
      haptic: () => {}
    };
  }, [session?.id, chatterLevel, plannedLoads, exercises, realtime, executionTimeline, repPaceSec]);

  // NEW: Seed coach responses on mount (SMART varied responses to demonstrate the system)
  useEffect(() => {
    seedResponses([
      // Pre-block
      { id:1,event_type:'pre_block',pattern:'any',mode:'any',chatter_level:'minimal',locale:'en-US',text_template:'Get ready. Weights set?',priority:5,cooldown_sec:20,active:true,usage_count:0,last_used_at:null },
      { id:2,event_type:'pre_block',pattern:'any',mode:'any',chatter_level:'minimal',locale:'en-US',text_template:'Block starting. Check your setup.',priority:4,cooldown_sec:20,active:true,usage_count:0,last_used_at:null },
      
      // Work start - WITH EXERCISE NAMES
      { id:3,event_type:'work_start',pattern:'any',mode:'any',chatter_level:'minimal',locale:'en-US',text_template:'{{exercise}} — {{cue}}',priority:5,cooldown_sec:30,active:true,usage_count:0,last_used_at:null },
      { id:4,event_type:'work_start',pattern:'any',mode:'any',chatter_level:'minimal',locale:'en-US',text_template:'Go — {{exercise}}. Stay tight.',priority:5,cooldown_sec:30,active:true,usage_count:0,last_used_at:null },
      { id:5,event_type:'work_start',pattern:'any',mode:'any',chatter_level:'minimal',locale:'en-US',text_template:'{{exercise}}. Own each rep.',priority:4,cooldown_sec:30,active:true,usage_count:0,last_used_at:null },
      
      // Work end - varied recovery cues
      { id:6,event_type:'work_end',pattern:'any',mode:'any',chatter_level:'minimal',locale:'en-US',text_template:'Good set. Shake it out.',priority:5,cooldown_sec:25,active:true,usage_count:0,last_used_at:null },
      { id:7,event_type:'work_end',pattern:'any',mode:'any',chatter_level:'minimal',locale:'en-US',text_template:'Strong work. Recover now.',priority:5,cooldown_sec:25,active:true,usage_count:0,last_used_at:null },
      { id:8,event_type:'work_end',pattern:'any',mode:'any',chatter_level:'minimal',locale:'en-US',text_template:'Set done. Deep breath.',priority:4,cooldown_sec:25,active:true,usage_count:0,last_used_at:null },
      
      // Rest start
      { id:9,event_type:'rest_start',pattern:'any',mode:'reps',chatter_level:'minimal',locale:'en-US',text_template:'Rest. Log your numbers.',priority:5,cooldown_sec:20,active:true,usage_count:0,last_used_at:null },
      { id:10,event_type:'rest_start',pattern:'any',mode:'reps',chatter_level:'minimal',locale:'en-US',text_template:'Breathe. Record your set.',priority:4,cooldown_sec:20,active:true,usage_count:0,last_used_at:null },
      
      // Rest end - WITH NEXT EXERCISE NAME
      { id:11,event_type:'rest_end',pattern:'any',mode:'any',chatter_level:'minimal',locale:'en-US',text_template:'Time. Back to {{exercise}}.',priority:5,cooldown_sec:20,active:true,usage_count:0,last_used_at:null },
      { id:12,event_type:'rest_end',pattern:'any',mode:'any',chatter_level:'minimal',locale:'en-US',text_template:'Rest over. {{exercise}} — lock in.',priority:4,cooldown_sec:20,active:true,usage_count:0,last_used_at:null },
      
      // Workout end
      { id:13,event_type:'workout_end',pattern:'any',mode:'any',chatter_level:'minimal',locale:'en-US',text_template:'Done. Strong session today.',priority:10,cooldown_sec:0,active:true,usage_count:0,last_used_at:null }
    ] as any);
  }, []);

  // NEW: Event emitter function
  const emitCoachEvent = useCallback((event: Event) => {
    onEvent(coachContext, event);
  }, [coachContext]);

  // Adapter layer - maps old speech recognition variables to Realtime API
  const listening = realtime.isListening;
  const transcript = coachingMessage;
  const resetTranscript = () => setCoachingMessage('');
  const browserSupportsSpeechRecognition = 'mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices;
  const isMicrophoneAvailable = browserSupportsSpeechRecognition;

  // DISABLED: Not loading intro messages from backend - focusing only on workout execution
  // useEffect(() => {
  //   if (coaching?.messages && coaching.messages.length > 0 && !hasLoadedInitialMessages.current) {
  //     const userMessages = coaching.messages
  //       .filter(msg => msg.role !== 'system')
  //       .map(msg => ({
  //         role: msg.role as 'user' | 'assistant',
  //         content: msg.content,
  //         timestamp: msg.timestamp
  //       }));
  //     setChatMessages(userMessages);
  //     if (coaching.voiceEnabled) {
  //       setVoiceEnabled(true);
  //     }
  //     hasLoadedInitialMessages.current = true;
  //   }
  // }, [coaching]);

  // Track last spoken message to prevent duplicates
  const lastSpokenMessageRef = useRef<string>('');

  // Voice output now handled by Realtime API directly - no need for browser TTS
  // Legacy playVoiceMessage function removed (Realtime API handles audio streaming)

  // Create persistent audio context (only once)
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioContextReady = useRef(false);
  
  const getAudioContext = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  };

  // Resume AudioContext after user interaction (required for autoplay policy)
  const resumeAudioContext = async () => {
    const audioContext = getAudioContext();
    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
        audioContextReady.current = true;
        console.log('AudioContext resumed successfully, state:', audioContext.state);
      } catch (error) {
        console.error('Failed to resume AudioContext:', error);
      }
    } else if (audioContext.state === 'running') {
      audioContextReady.current = true;
      console.log('AudioContext already running');
    }
  };

  // Beeps now handled by softened beeps.ts module (earbud-optimized)

  // Fetch set logs for current session
  const { data: setLogs } = useQuery<SetLog[]>({
    queryKey: ['/api/workout-sessions', session?.id, 'sets'],
    enabled: !!session?.id,
  });

  // Log set mutation
  const logSetMutation = useMutation({
    mutationFn: async (setData: {
      sessionId: number;
      superSetId: number;
      exerciseId: number;
      setNumber: number;
      reps: number;
      weight?: number;
    }) => {
      return await apiRequest('/api/sets/log', 'POST', setData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workout-sessions', session?.id, 'sets'] });
    }
  });

  // Graceful workout completion flag
  const isEndingWorkoutRef = useRef(false);

  // Complete workout mutation
  const completeWorkoutMutation = useMutation({
    mutationFn: async (notes?: string) => {
      return await apiRequest(`/api/workout-sessions/${session?.id}/complete`, 'POST', { notes });
    },
    onSuccess: () => {
      // Navigate back to workouts page
      window.location.href = '/workouts';
    },
    onError: (error) => {
      console.error('Failed to complete workout:', error);
      // Reset flag to allow retry
      isEndingWorkoutRef.current = false;
    }
  });

  // Graceful workout completion handler
  const handleEndWorkout = async () => {
    if (completeWorkoutMutation.isPending || isEndingWorkoutRef.current) return;
    isEndingWorkoutRef.current = true;
    
    try {
      // 1. Send workout_complete event to AI for farewell
      if (realtime.isConnected && isBlockWorkout && executionTimeline) {
        const elapsedMs = Date.now() - (workoutStartEpochMs || Date.now());
        realtime.sendEvent('workout_complete', {
          total_duration_s: Math.floor(elapsedMs / 1000),
        });
        
        // 2. Wait for AI audio to complete before navigating away
        console.log('⏳ Waiting for coach farewell...');
        await realtime.waitForAudioDone();
        console.log('✅ Coach farewell complete');
      }
      
      // 3. Gracefully disconnect from AI
      await realtime.disconnect(true);
      
      // 4. Complete the workout and navigate
      completeWorkoutMutation.mutate(undefined);
    } catch (error) {
      console.error('Error during workout completion:', error);
      // Allow retry on error
      isEndingWorkoutRef.current = false;
    }
  };

  // Send coaching message mutation with real workout context
  const sendCoachingMessageMutation = useMutation({
    mutationFn: async (message: string) => {
      return await apiRequest(`/api/coaching/${session?.id}/message`, 'POST', { 
        message, 
        exerciseId: isTemplateWorkout ? null : getCurrentExerciseId(), // Don't send exercise ID for template workouts
        setNumber: currentSet,
        // Send real workout context
        workoutContext: {
          currentExercise: currentExercise,
          currentSet: currentSet,
          totalSets: 6, // Get from actual workout data
          isRestPeriod: isResting,
          restTimeRemaining: restTimer,
          sessionId: session?.id,
          completedSets: setLogs?.length || 0
        }
      });
    },
    onSuccess: (data: any, sentMessage: string) => {
      // Use the message passed to mutate (from closure) instead of state
      setChatMessages(prev => [...prev, 
        { role: 'user', content: sentMessage, timestamp: new Date().toISOString() },
        { role: 'assistant', content: data.message, timestamp: new Date().toISOString() }
      ]);
      setCoachingMessage('');
      resetTranscript(); // Clear speech recognition transcript
      
      // Handle countdown trigger
      if (data.startCountdown) {
        setCountdown(10);
      }
      
      // Note: pause/resume commands are acknowledged by the coach but don't control timers
      // The coach will respond appropriately to STOP/PAUSE/START/RESUME commands
      
      // Invalidate coaching to keep it in sync
      queryClient.invalidateQueries({ queryKey: [`/api/coaching/${session?.id}`] });
    }
  });

  // Send workout template to AI as soon as websocket connects
  useEffect(() => {
    if (realtime.isConnected && !hasSentWorkoutTemplate.current && session?.workoutTemplate && templateExercises.length > 0) {
      console.log('📤 Sending workout template to AI coach...');
      realtime.updateContext({
        workoutTemplate: {
          name: session.workoutTemplate.name,
          totalRounds: session.workoutTemplate.totalRounds,
          exercises: templateExercises.map((ex: any) => ({
            name: ex.exercise?.name,
            primaryMuscleGroup: ex.exercise?.primaryMuscleGroup,
            equipment: ex.exercise?.equipmentPrimary,
            coachingTips: ex.exercise?.coachingBulletPoints,
            workSeconds: ex.workSeconds,
            restSeconds: ex.restSeconds
          }))
        },
        workoutPhase: 'ready',
        currentExerciseIndex: 0
      });
      hasSentWorkoutTemplate.current = true;
    }
  }, [realtime.isConnected, session?.workoutTemplate, templateExercises]);

  // Timer effect for work periods
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isWorking && workTimer > 0 && !isPaused) {
      interval = setInterval(() => {
        setWorkTimer(prev => prev - 1);
      }, 1000);
      
      // Update AI context with workout state (lightweight updates only, template already sent)
      if (realtime.isConnected) {
        realtime.updateContext({
          workoutPhase: 'working',
          timeRemaining: workTimer,
          currentExercise: currentTemplateExercise?.exercise?.name || 'Exercise',
          currentExerciseIndex: currentWorkExerciseIndex,
          isPaused: false,
        });
      }
      
      // Coach announcements during work period - only announce once per timer value
      if (workTimer === 10 && lastWorkAnnouncement.current !== 10) {
        sendAutomaticCoachMessage("10 seconds left.");
        lastWorkAnnouncement.current = 10;
      }
    } else if (workTimer === 0 && isWorking && !isPaused) {
      // Play long beep at end of work period
      beeps.play('end');
      
      // Work period ended - get rest time from exercise we just completed
      setIsWorking(false);
      if (isTemplateWorkout && templateExercises.length > 0) {
        const completedExercise = templateExercises[currentWorkExerciseIndex % templateExercises.length];
        if (completedExercise) {
          const restTime = completedExercise.restAfterExercise || 30;
          setRestTimer(restTime);
          setIsResting(true);
          sendAutomaticCoachMessage(`${restTime} seconds recovery..`);
          
          // Update AI context
          if (realtime.isConnected) {
            realtime.updateContext({
              workoutPhase: 'resting',
              timeRemaining: restTime,
              completedExercise: completedExercise.name,
              nextExercise: templateExercises[(currentWorkExerciseIndex + 1) % templateExercises.length]?.name
            });
          }
          // DO NOT increment index here - wait until rest ends
        }
      }
    }
    return () => clearInterval(interval);
  }, [isWorking, workTimer, isTemplateWorkout, templateExercises, currentWorkExerciseIndex, isPaused, realtime, currentTemplateExercise]);

  // Timer effect for rest periods
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isResting && restTimer > 0 && !isPaused) {
      interval = setInterval(() => {
        setRestTimer(prev => prev - 1);
      }, 1000);
      
      // Update AI context with rest state
      if (realtime.isConnected && restTimer % 5 === 0) { // Update every 5 seconds to avoid spam
        realtime.updateContext({
          workoutPhase: 'resting',
          timeRemaining: restTimer,
          nextExercise: templateExercises[(currentWorkExerciseIndex + 1) % templateExercises.length]?.name
        });
      }
      
      // Play countdown beeps before next set starts (3, 2, 1)
      if (restTimer === 3 || restTimer === 2 || restTimer === 1) {
        beeps.play('countdown');
      }
      
      // Coach announcements during rest period - only announce once per timer value
      if (restTimer === 15 && lastRestAnnouncement.current !== 15) {
        sendAutomaticCoachMessage("Half way through");
        lastRestAnnouncement.current = 15;
      } else if (restTimer === 5 && lastRestAnnouncement.current !== 5) {
        // Announce what's coming next
        if (isTemplateWorkout && templateExercises.length > 0) {
          const nextIndex = currentWorkExerciseIndex + 1;
          if (nextIndex < templateExercises.length) {
            const nextExercise = templateExercises[nextIndex];
            const currentExercise = templateExercises[currentWorkExerciseIndex];
            
            // Determine which round and exercise we're on
            const totalExercisesInWorkout = templateExercises.length / (session?.workoutTemplate?.totalRounds || 3);
            const nextSetNumberInExercise = (nextIndex % totalExercisesInWorkout) + 1;
            
            // Check if it's the same exercise or different
            if (currentExercise?.exercise?.name === nextExercise?.exercise?.name) {
              // Same exercise, different set
              sendAutomaticCoachMessage(`Get ready for ${nextSetNumberInExercise}${nextSetNumberInExercise === 2 ? 'nd' : nextSetNumberInExercise === 3 ? 'rd' : 'th'} ${nextExercise.exercise?.name} set`);
            } else {
              // Different exercise
              sendAutomaticCoachMessage(`Get ready for ${nextExercise.exercise?.name}`);
            }
          }
        }
        lastRestAnnouncement.current = 5;
      }
    } else if (restTimer === 0 && isResting && !isPaused) {
      // Play long beep when set starts (rest ends, work begins)
      beeps.play('start');
      
      setIsResting(false);
      // Rest ended - advance to NEXT exercise and start work
      if (isTemplateWorkout && templateExercises.length > 0) {
        const nextIndex = currentWorkExerciseIndex + 1;
        
        // Check if workout is complete
        if (nextIndex >= templateExercises.length) {
          sendAutomaticCoachMessage("Workout complete! Great job!");
          setIsWorking(false);
          setIsResting(false);
          return;
        }
        
        const nextExercise = templateExercises[nextIndex];
        const currentExercise = templateExercises[currentWorkExerciseIndex];
        
        if (nextExercise) {
          const workTime = nextExercise.workSeconds || 30;
          setCurrentWorkExerciseIndex(nextIndex); // Move to next exercise
          setTemplateExerciseIndex(nextIndex); // Keep templateExerciseIndex in sync for logging
          setWorkTimer(workTime);
          setIsWorking(true);
          
          // Get coaching tip for work start message
          const bulletPoints = nextExercise?.exercise?.coachingBulletPoints;
          let coachingTip = "keep pushing";
          if (bulletPoints) {
            const tips = bulletPoints
              .split(/[\n;]/)
              .map((t: string) => t.trim().replace(/^[•\-\*]\s*/, ''))
              .filter((t: string) => t.length > 0);
            if (tips.length > 0) {
              coachingTip = tips[0].toLowerCase();
            }
          }
          
          sendAutomaticCoachMessage(`Get in as many reps as possible in the ${workTime} seconds of work, and remember, ${coachingTip}`);
          
          // Reset time announcements for next cycle
          lastWorkAnnouncement.current = null;
          lastRestAnnouncement.current = null;
        }
      }
    }
    return () => clearInterval(interval);
  }, [isResting, restTimer, isTemplateWorkout, templateExercises, currentWorkExerciseIndex, session, isPaused]);

  // Countdown timer effect (10 seconds before workout starts)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (countdown !== null && countdown > 0 && !isPaused) {
      // Pre-announce at countdown start
      if (countdown === 10 && isTemplateWorkout && templateExercises.length > 0) {
        const firstExercise = templateExercises[0];
        const totalRounds = session?.workoutTemplate?.totalRounds || 3;
        if (firstExercise?.exercise?.name) {
          sendAutomaticCoachMessage(`Ok, ready to go in 10 with ${firstExercise.exercise.name} for ${totalRounds} sets.`);
        }
      }
      
      // Play short beeps at 3, 2, 1
      if (countdown === 3 || countdown === 2 || countdown === 1) {
        beeps.play('countdown');
      }
      
      interval = setInterval(() => {
        setCountdown(prev => prev !== null ? prev - 1 : null);
      }, 1000);
    } else if (countdown === 0 && !isPaused) {
      // Play long beep at 0 (work starts)
      beeps.play('start');
      
      setCountdown(null);
      // Reset to first exercise and start work timer
      if (isTemplateWorkout && templateExercises.length > 0) {
        setCurrentWorkExerciseIndex(0); // RESET to first exercise
        setTemplateExerciseIndex(0); // Keep in sync for logging
        const firstExercise = templateExercises[0];
        if (firstExercise) {
          const workTime = firstExercise.workSeconds || 30;
          setWorkTimer(workTime);
          setIsWorking(true);
          
          // Get coaching tip for work start message
          const bulletPoints = firstExercise?.exercise?.coachingBulletPoints;
          let coachingTip = "keep pushing";
          if (bulletPoints) {
            const tips = bulletPoints
              .split(/[\n;]/)
              .map((t: string) => t.trim().replace(/^[•\-\*]\s*/, ''))
              .filter((t: string) => t.length > 0);
            if (tips.length > 0) {
              coachingTip = tips[0].toLowerCase();
            }
          }
          
          sendAutomaticCoachMessage(`Get in as many reps as possible in the ${workTime} seconds of work, and remember, ${coachingTip}`);
        }
      }
    }
    return () => clearInterval(interval);
  }, [countdown, isTemplateWorkout, templateExercises, session, isPaused]);

  const getCurrentExerciseId = () => {
    // Mock exercise IDs for demo - in real implementation, get from workout data
    return currentExercise === 'A' ? 1 : 2;
  };

  const handleLogSet = (reps: number, weight?: number) => {
    if (!session) return;
    
    const exerciseId = isTemplateWorkout 
      ? currentTemplateExercise?.exerciseId 
      : getCurrentExerciseId();
    
    logSetMutation.mutate({
      sessionId: session.id,
      superSetId: 1, // Mock superset ID - get from actual workout data
      exerciseId: exerciseId!,
      setNumber: isTemplateWorkout ? templateExerciseIndex + 1 : currentSet,
      reps,
      weight
    });

    // Start rest timer
    setIsResting(true);
    setRestTimer(150); // Default rest time

    if (isTemplateWorkout) {
      // For template workouts, advance to next exercise
      setTemplateExerciseIndex(prev => prev + 1);
    } else {
      // For superset workouts, toggle between A/B
      if (currentExercise === 'A') {
        setCurrentExercise('B');
      } else {
        setCurrentExercise('A');
        setCurrentSet(prev => prev + 1);
      }
    }
  };

  // DISABLED: Old automatic coach system - replaced by observer pattern
  const sendAutomaticCoachMessage = (message: string) => {
    // Disabled to prevent overlap with new observer-based coach system
    console.log('[OLD COACH - DISABLED]', message);
    return;
  };

  const handleSendCoachingMessage = async () => {
    if (!coachingMessage.trim()) return;
    
    // Resume AudioContext on user interaction (required for browser autoplay policy)
    await resumeAudioContext();
    
    sendCoachingMessageMutation.mutate(coachingMessage);
  };

  // Realtime API handles audio directly - no auto-send needed
  // Transcripts appear in chat automatically via handleTranscript callback

  // Toggle microphone listening (Push-to-talk with Realtime API)
  const toggleMicrophone = async () => {
    // Guard against unsupported or unavailable microphone
    if (!browserSupportsSpeechRecognition || !isMicrophoneAvailable) {
      return;
    }

    // Resume AudioContext for beeps on first user interaction
    if (!audioContextReady.current) {
      await resumeAudioContext();
    }

    if (listening) {
      realtime.stopListening();
    } else {
      if (!realtime.isConnected) {
        console.log('🎙️ Connecting to Realtime API...');
        await realtime.connect();
      }
      console.log('🎤 Starting to listen...');
      await realtime.startListening();
    }
  };

  // Cleanup: disconnect Realtime API on unmount
  useEffect(() => {
    return () => {
      realtime.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only disconnect on unmount

  // Timeline execution timer for block workouts
  useEffect(() => {
    if (!isBlockWorkout || !executionTimeline || !workoutStartEpochMs) {
      return;
    }

    // Handle pause
    if (isPaused) {
      if (!pauseStartMs.current) {
        pauseStartMs.current = Date.now();
        console.log('⏸️ Workout paused at', Math.floor(elapsedMs / 1000), 'seconds');
      }
      return;
    }

    // Handle resume
    if (pauseStartMs.current) {
      const pauseDuration = Date.now() - pauseStartMs.current;
      totalPausedMs.current += pauseDuration;
      console.log(`▶️ Workout resumed after ${Math.floor(pauseDuration / 1000)}s pause (total paused: ${Math.floor(totalPausedMs.current / 1000)}s)`);
      pauseStartMs.current = null;
    }

    const RESYNC_INTERVAL_MS = 15000; // 15 seconds
    const DRIFT_TOLERANCE_MS = 250; // ±250ms

    const updateTimer = () => {
      const now = Date.now();
      // Calculate elapsed time excluding paused periods
      const elapsed = now - workoutStartEpochMs - totalPausedMs.current;
      
      setElapsedMs(elapsed);

      // Find current step based on elapsed time
      const steps = executionTimeline.executionTimeline;
      let newStepIndex = currentStepIndex;

      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        const duration = step.endMs - step.atMs;
        
        // For 0-duration steps (await_ready), match when we've reached or passed atMs
        // But skip if we've already processed this step (currentStepIndex > i)
        if (duration === 0 && elapsed >= step.atMs && currentStepIndex <= i) {
          newStepIndex = i;
          break;
        }
        // For normal steps, match within the time range
        else if (duration > 0 && elapsed >= step.atMs && elapsed < step.endMs) {
          newStepIndex = i;
          break;
        } 
        // Past last step - workout complete
        else if (elapsed >= step.endMs && i === steps.length - 1) {
          newStepIndex = steps.length;
          break;
        }
      }

      // Update step index first (before pausing)
      if (newStepIndex !== currentStepIndex) {
        console.log(`📍 Step transition: ${currentStepIndex} → ${newStepIndex} at ${Math.floor(elapsed / 1000)}s`);
        setCurrentStepIndex(newStepIndex);
      }

      // Check if we've reached an await_ready step (after updating index)
      const currentStep = newStepIndex < steps.length ? steps[newStepIndex] : null;
      if (currentStep && currentStep.type === 'await_ready' && !isAwaitingReady) {
        console.log(`⏸️ Reached await_ready step at ${Math.floor(elapsed / 1000)}s - waiting for user confirmation`);
        setIsAwaitingReady(true);
        setIsPaused(true); // Auto-pause on await_ready
      }

      // Drift detection: Check if setInterval is firing on time
      if (lastUpdateWallClockMs.current > 0) {
        const intervalDrift = now - lastUpdateWallClockMs.current - 100; // Expected 100ms interval
        if (Math.abs(intervalDrift) > DRIFT_TOLERANCE_MS) {
          console.warn(`⚠️ Interval drift detected: ${intervalDrift.toFixed(0)}ms (tolerance: ±${DRIFT_TOLERANCE_MS}ms)`);
        }
      }
      lastUpdateWallClockMs.current = now;

      // Resync validation every 15 seconds
      const timeSinceLastResync = elapsed - lastResyncMs.current;
      if (timeSinceLastResync >= RESYNC_INTERVAL_MS) {
        // Verify we're on the correct step (handle 0-duration steps)
        const expectedStep = steps.find((s: any) => {
          const stepDuration = s.endMs - s.atMs;
          if (stepDuration === 0) {
            return elapsed >= s.atMs && currentStepIndex <= steps.indexOf(s);
          }
          return elapsed >= s.atMs && elapsed < s.endMs;
        });
        if (expectedStep && newStepIndex < steps.length && steps[newStepIndex] !== expectedStep) {
          console.warn(`⚠️ Resync correction: expected step ${steps.indexOf(expectedStep)}, got ${newStepIndex}`);
          setCurrentStepIndex(steps.indexOf(expectedStep));
        } else {
          console.log(`⏰ Resync validated at ${Math.floor(elapsed / 1000)}s - step ${newStepIndex} correct`);
        }
        lastResyncMs.current = elapsed;
      }
    };

    // Update every 100ms for smooth UI
    timerRef.current = window.setInterval(updateTimer, 100);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isBlockWorkout, executionTimeline, workoutStartEpochMs, isPaused, currentStepIndex, elapsedMs, isAwaitingReady]);

  // Handler for confirming readiness - re-anchors timeline
  const handleReadyConfirmed = async () => {
    if (!isAwaitingReady || !executionTimeline || currentStepIndex >= executionTimeline.executionTimeline.length) return;
    
    // CRITICAL: Resume AudioContext for beeps on mobile
    await resumeAudioContext();
    
    const currentStep = executionTimeline.executionTimeline[currentStepIndex];
    
    // Don't send user_ready to AI - causes redundant speech
    // The AI already knows we're ready, just proceed to countdown
    
    // Finalize the active pause first (await_ready auto-paused)
    if (pauseStartMs.current) {
      const pauseDuration = Date.now() - pauseStartMs.current;
      totalPausedMs.current += pauseDuration;
      console.log(`⏸️ Finalizing await_ready pause: ${Math.floor(pauseDuration / 1000)}s (total paused: ${Math.floor(totalPausedMs.current / 1000)}s)`);
      pauseStartMs.current = null;
    }
    
    // Re-anchor: adjust workoutStartEpochMs so that current elapsed time stays at step.atMs
    // but the wall clock is "now" - this makes the next step start immediately
    const newWorkoutStartEpochMs = Date.now() - totalPausedMs.current - currentStep.atMs;
    
    console.log(`✅ Ready confirmed! Re-anchoring timeline from ${workoutStartEpochMs} to ${newWorkoutStartEpochMs}`);
    
    setWorkoutStartEpochMs(newWorkoutStartEpochMs);
    setIsAwaitingReady(false);
    setIsPaused(false); // Resume workout
    
    // Move to next step
    if (currentStepIndex + 1 < executionTimeline.executionTimeline.length) {
      setCurrentStepIndex(currentStepIndex + 1);
    }
  };

  // Send executionTimeline context to Realtime API (only on meaningful changes)
  useEffect(() => {
    if (!realtime.isConnected || !isBlockWorkout || !executionTimeline) return;

    const currentStep = currentStepIndex < executionTimeline.executionTimeline.length 
      ? executionTimeline.executionTimeline[currentStepIndex]
      : null;

    const context = {
      executionTimeline,
      currentStepIndex,
      currentStep,
      isAwaitingReady,
      workoutPhase: isPaused ? 'paused' : (currentStep?.type || 'unknown'),
      timeRemaining: currentStep ? Math.max(0, Math.ceil((currentStep.endMs - currentStep.atMs) / 1000)) : 0,
      // Populate exercise info for coach context
      currentExercise: currentStep?.exerciseName || null,
      currentExerciseIndex: currentStepIndex + 1,
    };

    console.log('📡 Sending timeline context to Realtime API:', { currentStepIndex, isAwaitingReady, isPaused });
    realtime.updateContext(context);
  }, [realtime.isConnected, isBlockWorkout, executionTimeline, currentStepIndex, isAwaitingReady, isPaused]);

  // AI Coach Voice Prompts - Event-driven model (host controls flow, AI observes)
  const previousStepIndexRef = useRef<number>(-1);
  const hasSpokenForStepRef = useRef<Set<number | string>>(new Set());
  
  useEffect(() => {
    if (!realtime.isConnected || !realtime.sendEvent || !isBlockWorkout || !executionTimeline || !workoutStartEpochMs) return;
    
    const currentStep = currentStepIndex < executionTimeline.executionTimeline.length 
      ? executionTimeline.executionTimeline[currentStepIndex]
      : null;
    
    // Workout complete - past last step
    if (!currentStep && currentStepIndex >= executionTimeline.executionTimeline.length && !hasSpokenForStepRef.current.has('workout_complete')) {
      realtime.sendEvent('workout_complete', {
        total_duration_s: Math.floor(elapsedMs / 1000),
      });
      emitCoachEvent({ type: 'EV_WORKOUT_END' });
      hasSpokenForStepRef.current.add('workout_complete');
      return;
    }
    
    if (!currentStep) return;
    
    // Detect step transitions and send appropriate events
    const previousStep = previousStepIndexRef.current >= 0 && previousStepIndexRef.current < executionTimeline.executionTimeline.length
      ? executionTimeline.executionTimeline[previousStepIndexRef.current]
      : null;
    
    // Send completion event for previous step
    if (previousStep && previousStepIndexRef.current !== currentStepIndex) {
      if (previousStep.type === 'work' && !hasSpokenForStepRef.current.has(`complete-${previousStepIndexRef.current}`)) {
        realtime.sendEvent('set_complete', {
          exercise_id: previousStep.exercise?.id || 'unknown',
          exercise_name: previousStep.exercise?.name || 'Exercise',
          set_index: previousStep.set || 1,
        });
        emitCoachEvent({ 
          type: 'EV_WORK_END', 
          exerciseId: previousStep.exercise?.id?.toString() || 'unknown' 
        });
        hasSpokenForStepRef.current.add(`complete-${previousStepIndexRef.current}`);
      } else if (previousStep.type === 'rest' && !hasSpokenForStepRef.current.has(`rest_complete-${previousStepIndexRef.current}`)) {
        realtime.sendEvent('rest_complete');
        emitCoachEvent({ type: 'EV_REST_END' });
        hasSpokenForStepRef.current.add(`rest_complete-${previousStepIndexRef.current}`);
      }
    }
    
    previousStepIndexRef.current = currentStepIndex;
    
    // Skip if already sent event for this step
    if (hasSpokenForStepRef.current.has(currentStepIndex)) return;
    
    // Send canonical events based on step type
    if (currentStep.type === 'await_ready') {
      // Find the next work step to get exercise details for the announcement
      const nextWorkStep = executionTimeline.executionTimeline
        .slice(currentStepIndex + 1)
        .find((step: any) => step.type === 'work');
      
      realtime.sendEvent('await_ready', {
        next_exercise: currentStep.label || 'next exercise',
        exercise_id: nextWorkStep?.exercise?.id || 'unknown',
        exercise_name: nextWorkStep?.exercise?.name || 'Exercise',
        set_index: nextWorkStep?.set || 1,
      });
      emitCoachEvent({ 
        type: 'EV_AWAIT_READY', 
        blockId: session?.id?.toString() || 'block-1' 
      });
    } else if (currentStep.type === 'work') {
      const exerciseName = currentStep.exercise?.name || 'Exercise';
      const duration = Math.ceil((currentStep.endMs - currentStep.atMs) / 1000);
      realtime.sendEvent('set_start', {
        exercise_id: currentStep.exercise?.id || 'unknown',
        exercise_name: exerciseName,
        set_index: currentStep.set || 1,
        work_s: duration,
      });
      emitCoachEvent({ 
        type: 'EV_WORK_START', 
        exerciseId: currentStep.exercise?.id?.toString() || 'unknown' 
      });
    } else if (currentStep.type === 'rest') {
      const duration = Math.ceil((currentStep.endMs - currentStep.atMs) / 1000);
      
      const nextStep = currentStepIndex + 1 < executionTimeline.executionTimeline.length
        ? executionTimeline.executionTimeline[currentStepIndex + 1]
        : null;
      
      realtime.sendEvent('rest_start', {
        duration_s: duration,
        next_exercise: nextStep?.exercise?.name || null,
        next_set: nextStep?.set || null,
      });
      emitCoachEvent({ 
        type: 'EV_REST_START', 
        sec: duration,
        reason: nextStep?.exercise?.name ? `before ${nextStep.exercise.name}` : undefined 
      });
    } else if (currentStep.type === 'instruction' && currentStep.preWorkout) {
      // Workout intro - not a canonical event, use sendText
      realtime.sendText(`Welcome to ${executionTimeline.workoutHeader.name}. Get ready to begin.`);
    }
    
    hasSpokenForStepRef.current.add(currentStepIndex);
  }, [realtime.isConnected, realtime.sendEvent, realtime.sendText, isBlockWorkout, executionTimeline, currentStepIndex, workoutStartEpochMs, elapsedMs]);

  // Midpoint encouragement and 10-second warning for work periods
  const midpointStepRef = useRef<number | null>(null);
  const tenSecWarningStepRef = useRef<number | null>(null);
  
  useEffect(() => {
    if (!realtime.isConnected || !realtime.sendEvent || !isBlockWorkout || !executionTimeline || isPaused || isAwaitingReady) return;
    
    const currentStep = currentStepIndex < executionTimeline.executionTimeline.length 
      ? executionTimeline.executionTimeline[currentStepIndex]
      : null;
    
    if (!currentStep || currentStep.type !== 'work') return;
    
    const stepDuration = Math.ceil((currentStep.endMs - currentStep.atMs) / 1000);
    const timeRemaining = stepDuration - Math.floor(elapsedMs / 1000) + Math.floor(currentStep.atMs / 1000);
    const elapsedInSet = stepDuration - timeRemaining;
    
    // Trigger midpoint encouragement at 50% of work duration (once per step)
    const midpoint = Math.floor(stepDuration / 2);
    if (elapsedInSet >= midpoint && midpointStepRef.current !== currentStepIndex && stepDuration >= 20) {
      realtime.sendEvent('set_midpoint', {
        exercise_id: currentStep.exercise?.id || 'unknown',
        exercise_name: currentStep.exercise?.name || 'Exercise',
        set_index: currentStep.set || 1,
      });
      // Note: No canonical coach event for midpoint - realtime API only
      midpointStepRef.current = currentStepIndex;
    }
    
    // Trigger 10-second warning once per step (context only - no AI response)
    if (timeRemaining === 10 && tenSecWarningStepRef.current !== currentStepIndex) {
      realtime.sendEvent('set_10s_remaining', {
        exercise_id: currentStep.exercise?.id || 'unknown',
        exercise_name: currentStep.exercise?.name || 'Exercise',
        set_index: currentStep.set || 1,
      });
      tenSecWarningStepRef.current = currentStepIndex;
    }
  }, [realtime.isConnected, realtime.sendEvent, isBlockWorkout, executionTimeline, currentStepIndex, elapsedMs, isPaused, isAwaitingReady]);

  // Countdown beeps for TIME-based workouts
  const beepsPlayedRef = useRef<Set<string>>(new Set()); // Track "step-second" combinations
  const lastBeepTimeRef = useRef<number>(0); // Track last beep timestamp to prevent rapid-fire
  
  useEffect(() => {
    if (!isBlockWorkout || !executionTimeline || isPaused || isAwaitingReady || !workoutStartEpochMs) return;
    
    const currentStep = currentStepIndex < executionTimeline.executionTimeline.length 
      ? executionTimeline.executionTimeline[currentStepIndex]
      : null;
    
    if (!currentStep) return;
    
    // Skip beeps for rep-based steps (these use await_ready instead)
    const isRepBased = currentStep.type === 'await_ready';
    if (isRepBased) return;
    
    const stepDuration = Math.ceil((currentStep.endMs - currentStep.atMs) / 1000);
    const timeRemaining = stepDuration - Math.floor(elapsedMs / 1000) + Math.floor(currentStep.atMs / 1000);
    
    // Prevent beeps within 600ms of each other (handles interval drift)
    const now = Date.now();
    const canBeep = now - lastBeepTimeRef.current > 600;
    
    // Helper to check if beep already played
    const beepKey = (second: number) => `${currentStepIndex}-${second}`;
    const hasPlayed = (second: number) => beepsPlayedRef.current.has(beepKey(second));
    const markPlayed = (second: number) => {
      beepsPlayedRef.current.add(beepKey(second));
      lastBeepTimeRef.current = Date.now();
    };
    
    // INSTRUCTION beeps (if WORK follows): 2 short beeps at 3s, 2s, then 1 long beep at 1s
    if (currentStep.type === 'instruction' && currentStep.preWorkout) {
      const nextStep = currentStepIndex + 1 < executionTimeline.executionTimeline.length
        ? executionTimeline.executionTimeline[currentStepIndex + 1]
        : null;
      
      // Only beep if next step is WORK (time-based)
      if (nextStep?.type === 'work') {
        if (timeRemaining === 3 && !hasPlayed(3) && canBeep) {
          beeps.play('countdown');
          markPlayed(3);
        } else if (timeRemaining === 2 && !hasPlayed(2) && canBeep) {
          beeps.play('countdown');
          markPlayed(2);
        } else if (timeRemaining === 1 && !hasPlayed(1) && canBeep) {
          beeps.play('start');
          markPlayed(1);
        }
      }
    }
    
    // REST beeps (if WORK follows): 2 short beeps at 3s, 2s, then 1 long beep at 1s
    if (currentStep.type === 'rest') {
      const nextStep = currentStepIndex + 1 < executionTimeline.executionTimeline.length
        ? executionTimeline.executionTimeline[currentStepIndex + 1]
        : null;
      
      // EV_WORK_PREVIEW: Announce upcoming exercise during rest (HIGH chatter only)
      // Use a special marker (99) to track preview playback
      if (FLAGS.COACH_V2 && chatterLevel === 'high' && nextStep?.type === 'work' && nextStep.exercise && !hasPlayed(99)) {
        emitCoachEvent({
          type: 'EV_WORK_PREVIEW',
          exerciseId: nextStep.exercise.id,
          setIndex: nextStep.set,
          totalSets: nextStep.totalSets,
          roundIndex: nextStep.round,
          totalRounds: nextStep.totalRounds
        });
        markPlayed(99);
      }
      
      // Only beep if next step is WORK (time-based)
      if (nextStep?.type === 'work') {
        if (timeRemaining === 3 && !hasPlayed(3) && canBeep) {
          beeps.play('countdown');
          markPlayed(3);
        } else if (timeRemaining === 2 && !hasPlayed(2) && canBeep) {
          beeps.play('countdown');
          markPlayed(2);
        } else if (timeRemaining === 1 && !hasPlayed(1) && canBeep) {
          beeps.play('start');
          markPlayed(1);
        }
      }
    }
    
    // WORK beeps: 1 long beep at 1s remaining (end of set signal)
    if (currentStep.type === 'work') {
      if (timeRemaining === 1 && !hasPlayed(1) && canBeep) {
        beeps.play('end');
        markPlayed(1);
      }
    }
  }, [isBlockWorkout, executionTimeline, currentStepIndex, elapsedMs, isPaused, isAwaitingReady, workoutStartEpochMs, emitCoachEvent, chatterLevel]);

  // Clear beep tracking when step changes
  useEffect(() => {
    beepsPlayedRef.current.clear();
  }, [currentStepIndex]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Timer className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p>Loading workout session...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-12">
          <Dumbbell className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No Active Workout</h3>
          <p className="text-muted-foreground">Start a workout to begin your session</p>
          <Button className="mt-4" onClick={() => window.location.href = '/workouts'}>
            Browse Workouts
          </Button>
        </div>
      </div>
    );
  }

  const totalSets = 6; // Default for superset demo
  const completedSets = setLogs?.length || 0;
  const progressPercentage = (completedSets / totalSets) * 100;

  // NEW: Show Intro Sheet for block workouts FIRST
  if (isBlockWorkout && showIntro && exercises.length > 0 && executionTimeline) {

    const firstBlock = executionTimeline.params;
    const blocks = [{
      id: 'block-1',
      name: firstBlock?.name || 'Block 1',
      params: {
        pattern: firstBlock?.pattern || 'superset',
        mode: firstBlock?.mode || 'reps',
        setsPerExercise: firstBlock?.setsPerExercise || firstBlock?.rounds || 3,
        workSec: firstBlock?.workSec,
        restSec: firstBlock?.restSec,
        roundRestSec: firstBlock?.roundRestSec,
        durationSec: firstBlock?.durationSec,
        targetReps: firstBlock?.targetReps || '8-12',
        awaitReadyBeforeStart: firstBlock?.awaitReadyBeforeStart || false
      },
      exerciseIds: exercises.map(e => e.id)
    }];

    return (
      <div className="container mx-auto px-4 py-8">
        <WorkoutIntroSheet
          workoutTitle={blockSession?.blockWorkout?.name || "Today's Workout"}
          blocks={blocks}
          exercises={exercises}
          defaultChatter={chatterLevel as IntroChatterLevel}
          defaultRepPaceSec={repPaceSec}
          onChangeChatter={(c) => setChatterLevel(c as ChatterLevel)}
          onChangeRepPace={setRepPaceSec}
          onOpenPreflight={() => {
            setShowIntro(false);
            setShowPreflight(true);
          }}
          onBegin={() => {
            setShowIntro(false);
            const hasRepBlocks = blocks.some(b => b.params?.mode === 'reps');
            if (hasRepBlocks) {
              setShowPreflight(true);
            } else {
              setPreflightCompleted(true);
            }
          }}
        />
      </div>
    );
  }

  // NEW: Show Preflight Weights Sheet for block workouts before starting
  if (isBlockWorkout && showPreflight && exercises.length > 0) {
    return (
      <div className="container mx-auto px-4 py-8 flex items-center justify-center min-h-screen">
        <PreflightWeightsSheet
          exercises={exercises}
          lastLoads={{}} // TODO: Fetch from previous session
          onSave={(loads) => {
            setPlannedLoads(loads);
            setPreflightCompleted(true);
            setShowPreflight(false);
          }}
          onCancel={() => {
            // Go back to intro instead of skipping
            setShowPreflight(false);
            setShowIntro(true);
          }}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Timeline-Based Workout (Block Workouts) */}
      {isBlockWorkout && executionTimeline && (
        <div className="space-y-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h1 className="text-2xl font-bold">{executionTimeline.workoutHeader.name}</h1>
              <p className="text-muted-foreground">
                {workoutStartEpochMs 
                  ? `Elapsed: ${formatTime(Math.floor((elapsedMs - (executionTimeline.workoutHeader.preWorkoutDurationMs || 0)) / 1000))}`
                  : `Duration: ${Math.floor(executionTimeline.workoutHeader.totalDurationSec / 60)} min`}
              </p>
            </div>
            <div className="flex gap-2">
              {!workoutStartEpochMs && (
                <Button 
                  onClick={async () => {
                    // Resume AudioContext for beeps (required for browser autoplay policy)
                    await resumeAudioContext();
                    
                    const now = Date.now();
                    setWorkoutStartEpochMs(now);
                    lastResyncMs.current = 0;
                    console.log('🚀 Workout started at', new Date(now).toISOString());
                    
                    // Emit EV_BLOCK_START to introduce the block
                    emitCoachEvent({ 
                      type: 'EV_BLOCK_START', 
                      blockId: 'block-1'
                    });
                    
                    // Auto-connect AI Coach when workout starts
                    try {
                      if (!realtime.isConnected) {
                        console.log('🎙️ Auto-connecting AI Coach...');
                        await realtime.connect();
                        console.log('✅ AI Coach connected - ready for voice interaction');
                        
                        // DISABLED: Auto-activate microphone (TTS-only mode)
                        // setTimeout(async () => {
                        //   if (!realtime.isListening) {
                        //     console.log('🎤 Auto-activating microphone...');
                        //     await realtime.startListening();
                        //   }
                        // }, 1000); // Wait 1s for connection to stabilize
                      }
                    } catch (error) {
                      console.error('Failed to auto-connect AI Coach:', error);
                    }
                  }}
                  data-testid="button-start-workout"
                >
                  <Play className="h-4 w-4 mr-2" />
                  Start Workout
                </Button>
              )}
              {workoutStartEpochMs && (
                <Button 
                  variant="outline"
                  onClick={() => setIsPaused(!isPaused)}
                  data-testid="button-pause-resume"
                >
                  {isPaused ? (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Resume
                    </>
                  ) : (
                    <>
                      <Pause className="h-4 w-4 mr-2" />
                      Pause
                    </>
                  )}
                </Button>
              )}
              <Button 
                variant="destructive" 
                onClick={handleEndWorkout}
                disabled={completeWorkoutMutation.isPending}
              >
                {completeWorkoutMutation.isPending ? 'Ending...' : 'End Workout'}
              </Button>
            </div>
          </div>

          {workoutStartEpochMs && currentStepIndex < executionTimeline.executionTimeline.length && (
            <Card className="border-primary">
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Current Step</span>
                  <Badge variant="default">
                    Step {currentStepIndex + 1} of {executionTimeline.executionTimeline.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const step = executionTimeline.executionTimeline[currentStepIndex];
                  
                  // Special UI for await_ready step
                  if (step.type === 'await_ready') {
                    return (
                      <div className="space-y-4 text-center py-6">
                        <div>
                          <div className="text-2xl font-bold mb-2">{step.label || "Ready to start?"}</div>
                          <div className="text-muted-foreground mb-4">
                            {step.coachPrompt || "Take a moment to prepare. When you're ready, click the button below."}
                          </div>
                        </div>
                        <Button 
                          size="lg"
                          onClick={handleReadyConfirmed}
                          className="w-full"
                          data-testid="button-ready-confirm"
                        >
                          <CheckCircle className="h-5 w-5 mr-2" />
                          I'm Ready
                        </Button>
                      </div>
                    );
                  }
                  
                  // Normal step UI
                  const stepElapsed = elapsedMs - step.atMs;
                  const stepDuration = step.endMs - step.atMs;
                  const stepRemaining = Math.max(0, Math.ceil((stepDuration - stepElapsed) / 1000));
                  const stepProgress = Math.min(100, (stepElapsed / stepDuration) * 100);

                  return (
                    <div className="space-y-4">
                      <div>
                        <div className="text-2xl font-bold">{step.action}</div>
                        {step.exerciseName && (
                          <div className="text-lg text-muted-foreground mt-1">{step.exerciseName}</div>
                        )}
                        {step.formCue && (
                          <div className="text-sm text-muted-foreground italic mt-2">{step.formCue}</div>
                        )}
                      </div>
                      
                      <div>
                        <div className="flex justify-between text-sm mb-2">
                          <span>Time Remaining</span>
                          <span className="font-mono font-bold text-lg">{stepRemaining}s</span>
                        </div>
                        <Progress value={stepProgress} className="h-3" />
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          {workoutStartEpochMs && currentStepIndex >= executionTimeline.executionTimeline.length && (
            <Card className="border-green-500">
              <CardContent className="pt-6">
                <div className="text-center">
                  <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                  <h3 className="text-2xl font-bold mb-2">Workout Complete!</h3>
                  <p className="text-muted-foreground">
                    Total time: {formatTime(Math.floor((elapsedMs - (executionTimeline.workoutHeader.preWorkoutDurationMs || 0)) / 1000))}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {executionTimeline.executionTimeline.map((step: any, idx: number) => {
                  // Calculate workout time (excluding pre-workout instruction)
                  const preWorkoutDurationMs = executionTimeline.workoutHeader?.preWorkoutDurationMs || 5000;
                  const workoutTimeMs = step.preWorkout ? 0 : Math.max(0, step.atMs - preWorkoutDurationMs);
                  const minutes = Math.floor(workoutTimeMs / 1000 / 60);
                  const seconds = Math.floor(workoutTimeMs / 1000) % 60;
                  
                  return (
                    <div 
                      key={idx} 
                      className={`flex gap-3 p-3 border rounded-lg ${idx === currentStepIndex && workoutStartEpochMs ? 'border-primary bg-primary/5' : ''}`}
                    >
                      <div className="flex-shrink-0 w-16 text-sm font-mono text-muted-foreground">
                        {step.preWorkout ? 'START' : `${minutes}:${seconds.toString().padStart(2, '0')}`}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium capitalize">{step.type}</div>
                        {step.exercise?.name && (
                          <div className="text-sm text-muted-foreground">{step.exercise.name}</div>
                        )}
                        {step.text && (
                          <div className="text-sm text-muted-foreground">{step.text}</div>
                        )}
                      </div>
                      <div className="flex-shrink-0 text-sm text-muted-foreground">
                        {Math.floor((step.endMs - step.atMs) / 1000)}s
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                AI Coach
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground">
                Timeline-based coaching will be active during workout execution
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Legacy Template-Based Workout */}
      {!isBlockWorkout && (
        <>
      {/* Session Header */}
      <div className="mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-2xl font-bold">Active Workout</h1>
            <p className="text-muted-foreground">Set {currentSet} of {totalSets / 2}</p>
          </div>
          <Button 
            variant="destructive" 
            onClick={handleEndWorkout}
            disabled={completeWorkoutMutation.isPending}
          >
            {completeWorkoutMutation.isPending ? 'Ending...' : 'End Workout'}
          </Button>
        </div>
        
        <Progress value={progressPercentage} className="h-2" />
        <div className="flex items-center justify-between mt-2">
          <p className="text-sm text-muted-foreground">
            {completedSets} of {totalSets} sets completed
          </p>
          {/* Pause/Resume Button */}
          {(countdown !== null || isWorking || isResting) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsPaused(!isPaused)}
              className="gap-2"
              data-testid="button-pause-resume"
            >
              {isPaused ? (
                <>
                  <Play className="h-4 w-4" />
                  Resume
                </>
              ) : (
                <>
                  <Pause className="h-4 w-4" />
                  Pause
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Main Workout Area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Countdown Timer */}
          {countdown !== null && (
            <Card className="border-green-200 bg-green-50">
              <CardContent className="pt-6">
                <div className="text-center">
                  <Timer className="h-12 w-12 mx-auto mb-2 text-green-600 animate-pulse" />
                  <h3 className="text-2xl font-semibold text-green-800 mb-2">Get Ready!</h3>
                  <div className="text-6xl font-bold text-green-600 mb-2">
                    {countdown}
                  </div>
                  <p className="text-sm text-green-700">Workout starts soon...</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Work Timer */}
          {isWorking && !countdown && (
            <Card className="border-blue-200 bg-blue-50">
              <CardContent className="pt-6">
                <div className="text-center">
                  <Timer className={`h-12 w-12 mx-auto mb-2 text-blue-600 ${!isPaused ? 'animate-pulse' : ''}`} />
                  <h3 className="text-2xl font-semibold text-blue-800 mb-2">
                    {isPaused ? 'PAUSED' : 'WORK!'}
                  </h3>
                  <div className="text-6xl font-bold text-blue-600 mb-2">
                    {workTimer}
                  </div>
                  <p className="text-sm text-blue-700">
                    {currentTemplateExercise?.exercise?.name || 'Exercise in progress'}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Rest Timer */}
          {isResting && !countdown && !isWorking && (
            <Card className="border-orange-200 bg-orange-50">
              <CardContent className="pt-6">
                <div className="text-center">
                  <Timer className={`h-12 w-12 mx-auto mb-2 text-orange-600 ${!isPaused ? 'animate-pulse' : ''}`} />
                  <h3 className="text-2xl font-semibold text-orange-800 mb-2">
                    {isPaused ? 'PAUSED' : 'Rest'}
                  </h3>
                  <div className="text-6xl font-bold text-orange-600 mb-2">
                    {restTimer}
                  </div>
                  <p className="text-sm text-orange-700">Next: {templateExercises[(currentWorkExerciseIndex + 1) % templateExercises.length]?.exercise?.name || 'Next exercise'}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Waiting to Start - For timed workouts that haven't begun */}
          {isTemplateWorkout && !countdown && !isWorking && !isResting && (
            <Card className="border-purple-200 bg-purple-50">
              <CardContent className="pt-6">
                <div className="text-center space-y-4">
                  <Dumbbell className="h-16 w-16 mx-auto mb-2 text-purple-600" />
                  <h3 className="text-2xl font-semibold text-purple-800">Ready to Begin?</h3>
                  <p className="text-purple-700 max-w-md mx-auto">
                    When you're ready to start your timed workout, tell the AI Coach "I'm ready" and a 10-second countdown will begin!
                  </p>
                  <div className="bg-white rounded-lg p-4 max-w-md mx-auto">
                    <h4 className="font-semibold text-sm mb-2 text-purple-900">Workout Overview:</h4>
                    <div className="text-sm text-gray-700 space-y-1">
                      <p><strong>{templateExercises.length}</strong> exercises</p>
                      <p><strong>{session?.workoutTemplate?.totalRounds || 3}</strong> rounds</p>
                      <p><strong>{templateExercises[0]?.workSeconds || 30}s</strong> work / <strong>{templateExercises[0]?.restSeconds || 30}s</strong> rest</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Exercise List - Always show for template workouts */}
          {isTemplateWorkout && (
            <Card>
              <CardHeader>
                <CardTitle>Exercises in This Workout</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {templateExercises.map((exercise: any, index: number) => (
                    <div 
                      key={index} 
                      className={`flex items-start gap-3 p-2 rounded-lg transition-colors ${
                        index === currentWorkExerciseIndex 
                          ? 'bg-blue-100 border-2 border-blue-400' 
                          : 'bg-muted'
                      }`}
                    >
                      <Badge variant={index === currentWorkExerciseIndex ? "default" : "outline"} className="mt-1">
                        {index + 1}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <h4 className={`font-semibold text-sm truncate ${
                          index === currentWorkExerciseIndex ? 'text-blue-900' : ''
                        }`}>
                          {exercise.exercise?.name || 'Exercise'}
                        </h4>
                        <p className="text-xs text-muted-foreground truncate">
                          {exercise.primaryMuscleGroup || 'Muscle group'}
                        </p>
                      </div>
                      <div className="text-right text-xs whitespace-nowrap">
                        <p className="font-medium">{exercise.workSeconds || 30}s</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Current Exercise - Only show for non-timed workouts */}
          {!isTemplateWorkout && (
            <Card className={currentExercise === 'A' ? 'border-blue-200 bg-blue-50' : 'border-green-200 bg-green-50'}>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle className="flex items-center gap-2">
                    <Badge variant={currentExercise === 'A' ? 'default' : 'secondary'}>
                      Exercise {currentExercise}
                    </Badge>
                    Current Exercise
                  </CardTitle>
                  <Badge variant="outline">Set {currentSet}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <h4 className="font-semibold text-lg">Exercise Name</h4>
                    <p className="text-muted-foreground">Details from exercise database...</p>
                  </div>

                  {/* Set Logging */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-sm font-medium">Reps</label>
                      <Input type="number" placeholder="12" min="1" max="50" />
                    </div>
                    <div>
                      <label className="text-sm font-medium">Weight (lbs)</label>
                      <Input type="number" placeholder="135" min="0" step="5" />
                    </div>
                    <div>
                      <label className="text-sm font-medium">RPE (1-10)</label>
                      <Input type="number" placeholder="8" min="1" max="10" />
                    </div>
                  </div>

                  <Button 
                    className="w-full" 
                    onClick={() => handleLogSet(12, 135)} // Mock data for demo
                    disabled={logSetMutation.isPending}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {logSetMutation.isPending ? 'Logging...' : 'Complete Set'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Set History */}
          <Card>
            <CardHeader>
              <CardTitle>Today's Sets</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {setLogs?.map((setLog, index) => (
                  <div key={index} className="flex justify-between items-center p-2 bg-muted rounded">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm">Set {setLog.setNumber}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {setLog.reps} reps × {setLog.weight || 0} lbs
                    </div>
                  </div>
                )) || (
                  <p className="text-muted-foreground text-center py-4">
                    No sets completed yet
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* AI Coaching Panel */}
        <div className="lg:col-span-1">
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                AI Coach
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={() => {
                    setVoiceEnabled(!voiceEnabled);
                    if (voiceEnabled) {
                      // Stop any ongoing speech when disabling
                      window.speechSynthesis.cancel();
                    }
                  }}
                  data-testid="button-voice-toggle"
                >
                  {voiceEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Chat Messages */}
              <div className="space-y-3 mb-4 max-h-64 overflow-y-auto" data-testid="chat-messages">
                {chatMessages.length === 0 && (
                  <div className="flex gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarFallback><Brain className="h-4 w-4" /></AvatarFallback>
                    </Avatar>
                    <div className="flex-1 p-2 bg-muted rounded-lg">
                      <p className="text-sm">
                        🎙️ Voice coach active! Just start talking - I can hear you.
                      </p>
                    </div>
                  </div>
                )}

                {chatMessages.map((msg, index) => (
                  <div key={index} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                    {msg.role === 'assistant' && (
                      <Avatar className="h-8 w-8">
                        <AvatarFallback><Brain className="h-4 w-4" /></AvatarFallback>
                      </Avatar>
                    )}
                    <div className={`flex-1 p-2 rounded-lg ${
                      msg.role === 'user' 
                        ? 'bg-primary text-primary-foreground ml-8' 
                        : 'bg-muted'
                    }`}>
                      <p className="text-sm whitespace-pre-line">{msg.content}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Browser Support Warning */}
              {!browserSupportsSpeechRecognition && (
                <div className="mb-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md">
                  <p className="text-xs text-yellow-800 dark:text-yellow-200">
                    Voice input not supported in this browser. Try Chrome or Edge for best experience.
                  </p>
                </div>
              )}

              {/* Microphone Permission Warning */}
              {browserSupportsSpeechRecognition && !isMicrophoneAvailable && (
                <div className="mb-2 p-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-md">
                  <p className="text-xs text-orange-800 dark:text-orange-200">
                    Microphone access required for voice input. Please enable microphone permissions in your browser settings.
                  </p>
                </div>
              )}

              {/* Message Input */}
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Input
                    placeholder={listening ? "Listening..." : "Type or speak your message..."}
                    value={coachingMessage}
                    onChange={(e) => setCoachingMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSendCoachingMessage()}
                    className={listening ? "border-red-500 dark:border-red-400" : ""}
                    data-testid="input-coach-message"
                  />
                  {listening && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      <div className="flex gap-1">
                        <div className="w-1 h-3 bg-red-500 animate-pulse" style={{animationDelay: '0ms'}}></div>
                        <div className="w-1 h-4 bg-red-500 animate-pulse" style={{animationDelay: '150ms'}}></div>
                        <div className="w-1 h-3 bg-red-500 animate-pulse" style={{animationDelay: '300ms'}}></div>
                      </div>
                    </div>
                  )}
                </div>
                
                {browserSupportsSpeechRecognition && (
                  <Button 
                    size="sm"
                    variant={listening ? "destructive" : "outline"}
                    onClick={toggleMicrophone}
                    disabled={!isMicrophoneAvailable}
                    title={!isMicrophoneAvailable ? "Microphone permission required" : listening ? "Stop listening" : "Start voice input"}
                    data-testid="button-microphone"
                  >
                    {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                  </Button>
                )}
                
                <Button 
                  size="sm" 
                  onClick={handleSendCoachingMessage}
                  disabled={sendCoachingMessageMutation.isPending || !coachingMessage.trim()}
                  data-testid="button-send-message"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>

              {/* Quick Actions */}
              <div className="mt-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">QUICK QUESTIONS</p>
                <div className="flex flex-wrap gap-1">
                  {[
                    "Form check?", 
                    "Too tired", 
                    "Rest time?", 
                    "Weight too heavy?"
                  ].map((quick) => (
                    <Button
                      key={quick}
                      variant="outline"
                      size="sm"
                      className="text-xs"
                      onClick={() => setCoachingMessage(quick)}
                    >
                      {quick}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
        </>
      )}
    </div>
  );
}