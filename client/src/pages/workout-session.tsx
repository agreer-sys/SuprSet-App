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
  const [restTimer, setRestTimer] = useState(0);
  const [isResting, setIsResting] = useState(false);
  const [coachingMessage, setCoachingMessage] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{role: 'user' | 'assistant', content: string, timestamp: string}>>([]);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const queryClient = useQueryClient();

  // Fetch active workout session
  const { data: session, isLoading } = useQuery<WorkoutSessionNew>({
    queryKey: ['/api/workout-sessions/active'],
  });

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
        exerciseId: getCurrentExerciseId(),
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
      setChatMessages(prev => [...prev, 
        { role: 'user', content: coachingMessage, timestamp: new Date().toISOString() },
        { role: 'assistant', content: data.message, timestamp: new Date().toISOString() }
      ]);
      setCoachingMessage('');
      
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

  // Timer effect for rest periods
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isResting && restTimer > 0) {
      interval = setInterval(() => {
        setRestTimer(prev => prev - 1);
      }, 1000);
    } else if (restTimer === 0 && isResting) {
      setIsResting(false);
    }
    return () => clearInterval(interval);
  }, [isResting, restTimer]);

  // Countdown timer effect (10 seconds before workout starts)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (countdown !== null && countdown > 0) {
      interval = setInterval(() => {
        setCountdown(prev => prev !== null ? prev - 1 : null);
      }, 1000);
    } else if (countdown === 0) {
      setCountdown(null);
      // Start the first exercise work timer here
    }
    return () => clearInterval(interval);
  }, [countdown]);

  const getCurrentExerciseId = () => {
    // Mock exercise IDs for demo - in real implementation, get from workout data
    return currentExercise === 'A' ? 1 : 2;
  };

  const handleLogSet = (reps: number, weight?: number) => {
    if (!session) return;
    
    logSetMutation.mutate({
      sessionId: session.id,
      superSetId: 1, // Mock superset ID - get from actual workout data
      exerciseId: getCurrentExerciseId()!,
      setNumber: currentSet,
      reps,
      weight
    });

    // Start rest timer
    setIsResting(true);
    setRestTimer(150); // Default rest time

    // Move to next exercise in superset
    if (currentExercise === 'A') {
      setCurrentExercise('B');
    } else {
      setCurrentExercise('A');
      setCurrentSet(prev => prev + 1);
    }
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

          {/* Rest Timer */}
          {isResting && !countdown && (
            <Card className="border-orange-200 bg-orange-50">
              <CardContent className="pt-6">
                <div className="text-center">
                  <Timer className="h-8 w-8 mx-auto mb-2 text-orange-600" />
                  <h3 className="text-lg font-semibold text-orange-800">Rest Period</h3>
                  <div className="text-3xl font-bold text-orange-600 mb-2">
                    {formatTime(restTimer)}
                  </div>
                  <Button 
                    variant="outline" 
                    onClick={() => setIsResting(false)}
                    className="text-orange-600 border-orange-300"
                  >
                    Skip Rest
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Current Exercise */}
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