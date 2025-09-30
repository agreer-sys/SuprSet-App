import { useState, useEffect } from "react";
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
import { 
  Play, Pause, Square, MessageSquare, Send, Timer, 
  CheckCircle, Circle, Dumbbell, Brain, Volume2, VolumeX 
} from "lucide-react";
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
  
  // Debug countdown changes
  useEffect(() => {
    console.log('Countdown state changed:', countdown);
  }, [countdown]);
  const [voiceEnabled, setVoiceEnabled] = useState(true); // Enable voice by default for coach dictation
  const [lastWorkAnnouncement, setLastWorkAnnouncement] = useState<number | null>(null);
  const [lastRestAnnouncement, setLastRestAnnouncement] = useState<number | null>(null);
  const queryClient = useQueryClient();

  // Fetch active workout session (may include workoutTemplate)
  const { data: session, isLoading } = useQuery<any>({
    queryKey: ['/api/workout-sessions/active'],
  });

  // Flatten all exercises from all sections for template workouts
  const templateExercises = session?.workoutTemplate?.sections?.flatMap((section: any) => 
    section.exercises || []
  ) || [];
  
  const currentTemplateExercise = templateExercises.length > 0 
    ? templateExercises[currentWorkExerciseIndex % templateExercises.length]
    : null;
  
  const isTemplateWorkout = !!session?.workoutTemplate;

  // Fetch coaching session
  const { data: coaching } = useQuery<CoachingSession>({
    queryKey: [`/api/coaching/${session?.id}`],
    enabled: !!session?.id,
  });

  // Load coaching messages from backend when coaching session is available
  useEffect(() => {
    if (coaching?.messages && coaching.messages.length > 0) {
      // Filter out system messages and map to expected format
      const userMessages = coaching.messages
        .filter(msg => msg.role !== 'system')
        .map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
          timestamp: msg.timestamp
        }));
      setChatMessages(userMessages);
      // Auto-enable voice if coaching has voiceEnabled
      if (coaching.voiceEnabled) {
        setVoiceEnabled(true);
      }
    }
  }, [coaching]);

  // Auto-play voice for new assistant messages when voice is enabled
  useEffect(() => {
    if (voiceEnabled && chatMessages.length > 0) {
      const lastMessage = chatMessages[chatMessages.length - 1];
      if (lastMessage.role === 'assistant') {
        playVoiceMessage(lastMessage.content);
      }
    }
  }, [chatMessages, voiceEnabled]);

  // Function to play voice message using browser's speech synthesis
  const playVoiceMessage = (text: string) => {
    if ('speechSynthesis' in window) {
      // Cancel any ongoing speech
      window.speechSynthesis.cancel();
      
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      
      window.speechSynthesis.speak(utterance);
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
    onSuccess: (data: any) => {
      console.log('Coach response received:', data);
      console.log('startCountdown flag:', data.startCountdown);
      
      setChatMessages(prev => [...prev, 
        { role: 'user', content: coachingMessage, timestamp: new Date().toISOString() },
        { role: 'assistant', content: data.message, timestamp: new Date().toISOString() }
      ]);
      setCoachingMessage('');
      
      // Handle countdown trigger
      if (data.startCountdown) {
        console.log('Setting countdown to 10!');
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
    if (isWorking && workTimer > 0) {
      interval = setInterval(() => {
        setWorkTimer(prev => prev - 1);
      }, 1000);
      
      // Coach announcements during work period - only announce once per timer value
      if (workTimer === 15 && lastWorkAnnouncement !== 15) {
        sendAutomaticCoachMessage("Halfway there! Keep pushing!");
        setLastWorkAnnouncement(15);
      } else if (workTimer === 10 && lastWorkAnnouncement !== 10) {
        sendAutomaticCoachMessage("10 seconds left! Finish strong!");
        setLastWorkAnnouncement(10);
      }
    } else if (workTimer === 0 && isWorking) {
      // Work period ended - get rest time from exercise we just completed
      setIsWorking(false);
      if (isTemplateWorkout && templateExercises.length > 0) {
        const completedExercise = templateExercises[currentWorkExerciseIndex % templateExercises.length];
        if (completedExercise) {
          const restTime = completedExercise.restAfterExercise || 30;
          setRestTimer(restTime);
          setIsResting(true);
          sendAutomaticCoachMessage(`Great work! Rest now for ${restTime} seconds.`);
          // DO NOT increment index here - wait until rest ends
        }
      }
    }
    return () => clearInterval(interval);
  }, [isWorking, workTimer, isTemplateWorkout, templateExercises, currentWorkExerciseIndex, lastWorkAnnouncement]);

  // Timer effect for rest periods
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isResting && restTimer > 0) {
      interval = setInterval(() => {
        setRestTimer(prev => prev - 1);
      }, 1000);
      
      // Coach announcements during rest period - only announce once per timer value
      if (restTimer === 15 && lastRestAnnouncement !== 15) {
        sendAutomaticCoachMessage("15 seconds of rest left. Get ready!");
        setLastRestAnnouncement(15);
      } else if (restTimer === 5 && lastRestAnnouncement !== 5) {
        sendAutomaticCoachMessage("5 seconds! Prepare to work!");
        setLastRestAnnouncement(5);
      }
    } else if (restTimer === 0 && isResting) {
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
          
          // Determine which round and exercise we're on
          const totalExercisesInWorkout = templateExercises.length / (session?.workoutTemplate?.totalRounds || 3);
          const setNumberInExercise = (currentWorkExerciseIndex % totalExercisesInWorkout) + 1;
          const nextSetNumberInExercise = (nextIndex % totalExercisesInWorkout) + 1;
          
          // Check if we're moving to a different exercise or just another set
          if (currentExercise?.exercise?.name !== nextExercise?.exercise?.name) {
            sendAutomaticCoachMessage(`Moving to ${nextExercise.exercise?.name}! Let's go!`);
          } else {
            const setsPerExercise = session?.workoutTemplate?.totalRounds || 3;
            sendAutomaticCoachMessage(`Set ${nextSetNumberInExercise} of ${setsPerExercise}. Begin ${nextExercise.exercise?.name}!`);
          }
          
          // Reset time announcements for next cycle
          setLastWorkAnnouncement(null);
          setLastRestAnnouncement(null);
        }
      }
    }
    return () => clearInterval(interval);
  }, [isResting, restTimer, isTemplateWorkout, templateExercises, currentWorkExerciseIndex, session, lastRestAnnouncement]);

  // Countdown timer effect (10 seconds before workout starts)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (countdown !== null && countdown > 0) {
      interval = setInterval(() => {
        setCountdown(prev => prev !== null ? prev - 1 : null);
      }, 1000);
    } else if (countdown === 0) {
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
          sendAutomaticCoachMessage(`Let's go! Begin ${firstExercise.exercise?.name} for ${workTime} seconds!`);
        }
      }
    }
    return () => clearInterval(interval);
  }, [countdown, isTemplateWorkout, templateExercises]);

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
    
    // Send message to backend
    apiRequest(`/api/coaching/${session.id}/message`, 'POST', { 
      message, 
      exerciseId: null,
      setNumber: currentSet,
      workoutContext: {
        currentExercise: currentTemplateExercise,
        currentSet: currentSet,
        totalSets: 9, // 3 exercises × 3 rounds
        isRestPeriod: isResting,
        restTimeRemaining: restTimer,
        sessionId: session.id,
        completedSets: 0
      }
    }).then((data: any) => {
      // Add both the automatic trigger and coach response to chat
      setChatMessages(prev => [...prev, 
        { role: 'assistant', content: data.message, timestamp: new Date().toISOString() }
      ]);
      
      // Speak the response if voice is enabled
      if (voiceEnabled && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(data.message);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        window.speechSynthesis.speak(utterance);
      }
    }).catch(err => {
      console.error('Error sending automatic coach message:', err);
    });
  };

  const handleSendCoachingMessage = () => {
    if (!coachingMessage.trim()) return;
    sendCoachingMessageMutation.mutate(coachingMessage);
  };

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
        <p className="text-sm text-muted-foreground mt-1">
          {completedSets} of {totalSets} sets completed
        </p>
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

              {/* Message Input */}
              <div className="flex gap-2">
                <Input
                  placeholder="Ask about form, need motivation..."
                  value={coachingMessage}
                  onChange={(e) => setCoachingMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendCoachingMessage()}
                />
                <Button 
                  size="sm" 
                  onClick={handleSendCoachingMessage}
                  disabled={sendCoachingMessageMutation.isPending || !coachingMessage.trim()}
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