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
  CheckCircle, Circle, Dumbbell, Brain, Volume2, VolumeX, Mic, MicOff, Radio 
} from "lucide-react";
import { usePorcupine } from '@picovoice/porcupine-react';
import { BuiltInKeyword } from '@picovoice/porcupine-web';
import { useRealtimeVoice } from '@/hooks/useRealtimeVoice';
import type { WorkoutSessionNew, SetLog, CoachingSession } from "@shared/schema";

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
  const [wakeWordEnabled, setWakeWordEnabled] = useState(false);
  const [wakeWordListening, setWakeWordListening] = useState(false);
  const hasLoadedInitialMessages = useRef(false);
  const lastWorkAnnouncement = useRef<number | null>(null);
  const lastRestAnnouncement = useRef<number | null>(null);
  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const queryClient = useQueryClient();

  // Wake-word detection with Picovoice Porcupine
  const {
    keywordDetection,
    isLoaded: porcupineLoaded,
    isListening: porcupineListening,
    error: porcupineError,
    init: initPorcupine,
    start: startPorcupine,
    stop: stopPorcupine,
    release: releasePorcupine
  } = usePorcupine();

  // Fetch active workout session (may include workoutTemplate) - MUST be before useRealtimeVoice
  const { data: session, isLoading } = useQuery<any>({
    queryKey: ['/api/workout-sessions/active'],
  });

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

  // OpenAI Realtime API for voice interaction - replaces react-speech-recognition
  const handleFunctionCall = useCallback((functionName: string, args: any) => {
    console.log('🔧 AI Coach function call:', functionName, args);
    
    switch (functionName) {
      case 'pause_workout':
        setIsPaused(true);
        setIsWorking(false);
        setIsResting(false);
        break;
      case 'resume_workout':
        setIsPaused(false);
        break;
      case 'start_countdown':
        setCountdown(10);
        break;
      case 'start_rest_timer':
        setRestTimer(args.duration || 30);
        setIsResting(true);
        setIsWorking(false);
        break;
      case 'next_exercise':
        setCurrentSet(prev => prev + 1);
        break;
    }
  }, []);

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
    onFunctionCall: handleFunctionCall,
    onTranscript: handleTranscript,
    onError: handleRealtimeError,
  });

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

  // Function to play short beep (for countdown 3, 2, 1)
  const playShortBeep = () => {
    if (!audioContextReady.current) {
      console.warn('AudioContext not ready. Beep skipped.');
      return;
    }
    
    try {
      const audioContext = getAudioContext();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 440; // 440 Hz (A note - more audible)
      oscillator.type = 'sine';
      
      const now = audioContext.currentTime;
      gainNode.gain.setValueAtTime(0.5, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      
      oscillator.start(now);
      oscillator.stop(now + 0.2); // 200ms short beep
      
      console.log('Short beep played at', new Date().toLocaleTimeString());
    } catch (error) {
      console.error('Error playing short beep:', error);
    }
  };

  // Function to play long beep (for start and end of set)
  const playLongBeep = () => {
    if (!audioContextReady.current) {
      console.warn('AudioContext not ready. Beep skipped.');
      return;
    }
    
    try {
      const audioContext = getAudioContext();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 523; // 523 Hz (C note - pleasant and audible)
      oscillator.type = 'sine';
      
      const now = audioContext.currentTime;
      gainNode.gain.setValueAtTime(0.5, now);
      gainNode.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
      
      oscillator.start(now);
      oscillator.stop(now + 1.0); // 1 second long beep
      
      console.log('Long beep played at', new Date().toLocaleTimeString());
    } catch (error) {
      console.error('Error playing long beep:', error);
    }
  };

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

  // Complete workout mutation
  const completeWorkoutMutation = useMutation({
    mutationFn: async (notes?: string) => {
      return await apiRequest(`/api/workout-sessions/${session?.id}/complete`, 'POST', { notes });
    },
    onSuccess: () => {
      // Navigate back to workouts page
      window.location.href = '/workouts';
    }
  });

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

  // Timer effect for work periods
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isWorking && workTimer > 0 && !isPaused) {
      interval = setInterval(() => {
        setWorkTimer(prev => prev - 1);
      }, 1000);
      
      // Coach announcements during work period - only announce once per timer value
      if (workTimer === 10 && lastWorkAnnouncement.current !== 10) {
        sendAutomaticCoachMessage("10 seconds left.");
        lastWorkAnnouncement.current = 10;
      }
    } else if (workTimer === 0 && isWorking && !isPaused) {
      // Play long beep at end of work period
      playLongBeep();
      
      // Work period ended - get rest time from exercise we just completed
      setIsWorking(false);
      if (isTemplateWorkout && templateExercises.length > 0) {
        const completedExercise = templateExercises[currentWorkExerciseIndex % templateExercises.length];
        if (completedExercise) {
          const restTime = completedExercise.restAfterExercise || 30;
          setRestTimer(restTime);
          setIsResting(true);
          sendAutomaticCoachMessage(`${restTime} seconds recovery..`);
          // DO NOT increment index here - wait until rest ends
        }
      }
    }
    return () => clearInterval(interval);
  }, [isWorking, workTimer, isTemplateWorkout, templateExercises, currentWorkExerciseIndex, isPaused]);

  // Timer effect for rest periods
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isResting && restTimer > 0 && !isPaused) {
      interval = setInterval(() => {
        setRestTimer(prev => prev - 1);
      }, 1000);
      
      // Play countdown beeps before next set starts (3, 2, 1)
      if (restTimer === 3 || restTimer === 2 || restTimer === 1) {
        playShortBeep();
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
      playLongBeep();
      
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
        playShortBeep();
      }
      
      interval = setInterval(() => {
        setCountdown(prev => prev !== null ? prev - 1 : null);
      }, 1000);
    } else if (countdown === 0 && !isPaused) {
      // Play long beep at 0 (work starts)
      playLongBeep();
      
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

  // Automatic coach message sender for timer events
  const sendAutomaticCoachMessage = (message: string) => {
    if (!session?.id) return;
    
    // Add message directly to chat as assistant message (no AI processing)
    // The useEffect will handle speaking it automatically
    setChatMessages(prev => [...prev, 
      { role: 'assistant', content: message, timestamp: new Date().toISOString() }
    ]);
  };

  const handleSendCoachingMessage = async () => {
    if (!coachingMessage.trim()) return;
    
    // Resume AudioContext on user interaction (required for browser autoplay policy)
    await resumeAudioContext();
    
    sendCoachingMessageMutation.mutate(coachingMessage);
  };

  // Track previous listening state and auto-send scheduling
  const prevListeningRef = useRef(listening);
  const autoSendScheduledRef = useRef(false);

  // Auto-send when listening stops and there's a message (with debounce for transcript completion)
  useEffect(() => {
    if (prevListeningRef.current && !listening && !autoSendScheduledRef.current) {
      // Listening just stopped - capture message immediately and schedule send
      autoSendScheduledRef.current = true;
      const capturedMessage = coachingMessage.trim();
      
      const timer = setTimeout(() => {
        if (capturedMessage) {
          sendCoachingMessageMutation.mutate(capturedMessage);
        }
        autoSendScheduledRef.current = false;
      }, 400); // 400ms debounce to allow final transcript to arrive
      
      return () => {
        clearTimeout(timer);
        autoSendScheduledRef.current = false;
      };
    }
    prevListeningRef.current = listening;
  }, [listening]); // Only depend on listening, not coachingMessage

  // Toggle microphone listening
  const toggleMicrophone = async () => {
    // Guard against unsupported or unavailable microphone
    if (!browserSupportsSpeechRecognition || !isMicrophoneAvailable) {
      return;
    }

    if (listening) {
      realtime.stopListening();
    } else {
      if (!realtime.isConnected) {
        await realtime.connect();
      }
      await realtime.startListening();
    }
  };

  // Initialize Porcupine wake-word detection
  useEffect(() => {
    if (wakeWordEnabled && !porcupineLoaded) {
      const accessKey = import.meta.env.VITE_PICOVOICE_ACCESS_KEY || (window as any).ENV?.PICOVOICE_ACCESS_KEY;
      
      if (!accessKey) {
        console.error('Picovoice access key not found');
        return;
      }

      // Initialize with built-in keyword and default Porcupine model from CDN
      initPorcupine(
        accessKey,
        [BuiltInKeyword.Computer],
        { 
          publicPath: 'https://cdn.jsdelivr.net/gh/Picovoice/porcupine@master/lib/common/porcupine_params.pv',
          forceWrite: true 
        }
      );
    }
  }, [wakeWordEnabled, porcupineLoaded]);

  // Start/stop Porcupine based on wake-word toggle and mic availability
  useEffect(() => {
    if (!porcupineLoaded) return; // Guard: Don't try to use Porcupine if not loaded
    
    if (!wakeWordEnabled && porcupineListening) {
      // Explicitly stop Porcupine when wake-word is disabled
      try {
        stopPorcupine();
        setWakeWordListening(false);
      } catch (error) {
        console.error('Error stopping Porcupine:', error);
      }
    } else if (wakeWordEnabled && !listening && !porcupineListening) {
      // Start listening for wake-word only when not using manual mic
      try {
        startPorcupine();
        setWakeWordListening(true);
      } catch (error) {
        console.error('Error starting Porcupine:', error);
      }
    } else if (porcupineListening && listening) {
      // Pause wake-word detection when manual mic is active (mic arbitration)
      try {
        stopPorcupine();
        setWakeWordListening(false);
      } catch (error) {
        console.error('Error pausing Porcupine:', error);
      }
    }
  }, [wakeWordEnabled, porcupineLoaded, listening, porcupineListening]);

  // Handle wake-word detection
  useEffect(() => {
    if (keywordDetection) {
      console.log('✅ Wake word detected:', keywordDetection.label);
      
      // Check if not in cooldown period
      if (cooldownTimerRef.current) {
        console.log('⏳ Wake-word in cooldown, ignoring detection');
        return;
      }

      // Pause Porcupine temporarily
      if (porcupineListening && porcupineLoaded) {
        try {
          stopPorcupine();
          setWakeWordListening(false);
        } catch (error) {
          console.error('Error stopping Porcupine after detection:', error);
        }
      }

      // Clear any existing transcript and reset the coaching message
      resetTranscript();
      setCoachingMessage('');

      // Add a 500ms delay to avoid capturing the tail end of the wake-word
      // Then start Realtime voice for user query
      setTimeout(async () => {
        console.log('🎙️ Connecting to Realtime API...');
        try {
          if (!realtime.isConnected) {
            await realtime.connect();
          }
          await realtime.startListening();
          console.log('🎤 Listening started');
        } catch (error) {
          console.error('Failed to start Realtime session:', error);
        }
      }, 500);

      // Set cooldown to prevent repeated triggers (5 seconds)
      cooldownTimerRef.current = setTimeout(() => {
        cooldownTimerRef.current = null;
        // Resume Porcupine after cooldown if wake-word still enabled and not manually listening
        if (wakeWordEnabled && !listening && porcupineLoaded) {
          try {
            startPorcupine();
            setWakeWordListening(true);
            console.log('🔄 Porcupine resumed after cooldown');
          } catch (error) {
            console.error('Error resuming Porcupine after cooldown:', error);
          }
        }
      }, 5000);
    }
  }, [keywordDetection, wakeWordEnabled, listening, porcupineLoaded, porcupineListening, realtime]);

  // Resume Porcupine after manual mic session ends
  useEffect(() => {
    if (!listening && wakeWordEnabled && porcupineLoaded && !cooldownTimerRef.current) {
      // Small delay to avoid race conditions
      const timer = setTimeout(() => {
        if (!listening && wakeWordEnabled && porcupineLoaded) {
          try {
            startPorcupine();
            setWakeWordListening(true);
          } catch (error) {
            console.error('Error resuming Porcupine after mic ends:', error);
          }
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [listening, wakeWordEnabled, porcupineLoaded]);

  // Cleanup: stop listening and release Porcupine on unmount
  useEffect(() => {
    return () => {
      realtime.disconnect();
      if (porcupineListening && porcupineLoaded) {
        try {
          stopPorcupine();
        } catch (error) {
          console.error('Error stopping Porcupine on cleanup:', error);
        }
      }
      if (porcupineLoaded) {
        try {
          releasePorcupine();
        } catch (error) {
          console.error('Error releasing Porcupine on cleanup:', error);
        }
      }
      if (cooldownTimerRef.current) {
        clearTimeout(cooldownTimerRef.current);
      }
    };
  }, [realtime, porcupineLoaded, porcupineListening]);

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

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Session Header */}
      <div className="mb-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h1 className="text-2xl font-bold">Active Workout</h1>
            <p className="text-muted-foreground">Set {currentSet} of {totalSets / 2}</p>
          </div>
          <Button 
            variant="destructive" 
            onClick={() => completeWorkoutMutation.mutate(undefined)}
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
                  <Timer className="h-12 w-12 mx-auto mb-2 text-blue-600 animate-pulse" />
                  <h3 className="text-2xl font-semibold text-blue-800 mb-2">WORK!</h3>
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
                  <Timer className="h-12 w-12 mx-auto mb-2 text-orange-600 animate-pulse" />
                  <h3 className="text-2xl font-semibold text-orange-800 mb-2">Rest</h3>
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
            <>
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

              {/* Exercise List */}
              <Card>
                <CardHeader>
                  <CardTitle>Exercises in This Workout</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {templateExercises.map((exercise: any, index: number) => (
                      <div key={index} className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                        <Badge variant="outline" className="mt-1">{index + 1}</Badge>
                        <div className="flex-1">
                          <h4 className="font-semibold">{exercise.exercise?.name || 'Exercise'}</h4>
                          <p className="text-sm text-muted-foreground">{exercise.primaryMuscleGroup || 'Muscle group'}</p>
                          {exercise.equipment && (
                            <p className="text-xs text-muted-foreground mt-1">Equipment: {exercise.equipment}</p>
                          )}
                        </div>
                        <div className="text-right text-sm">
                          <p className="font-medium">{exercise.workSeconds || 30}s work</p>
                          <p className="text-muted-foreground">{exercise.restSeconds || 30}s rest</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
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
                        AI Coach is ready! Send a message to get started.
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

              {/* Porcupine Error Warning */}
              {porcupineError && (
                <div className="mb-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                  <p className="text-xs text-red-800 dark:text-red-200">
                    Wake-word error: {porcupineError.toString()}
                  </p>
                </div>
              )}

              {/* Wake-Word Toggle */}
              <div className="mb-3 flex items-center justify-between p-2 bg-muted/50 rounded-md">
                <div className="flex items-center gap-2">
                  <Radio className={`h-4 w-4 ${wakeWordListening ? 'text-green-600 animate-pulse' : 'text-muted-foreground'}`} />
                  <div>
                    <Label htmlFor="wake-word-toggle" className="text-sm font-medium cursor-pointer">
                      "Computer" Wake Word
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      {wakeWordListening ? 'Say "Computer" to activate...' : wakeWordEnabled ? 'Initializing...' : 'Hands-free voice commands (built-in)'}
                    </p>
                  </div>
                </div>
                <Switch
                  id="wake-word-toggle"
                  checked={wakeWordEnabled}
                  onCheckedChange={setWakeWordEnabled}
                  disabled={!browserSupportsSpeechRecognition || !isMicrophoneAvailable}
                  data-testid="switch-wake-word"
                />
              </div>

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
    </div>
  );
}