import { useState, useEffect } from "react";
import { Play, Pause, RotateCcw, Square } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Settings } from "lucide-react";
import type { Exercise } from "@shared/schema";

interface WorkoutTimerProps {
  selectedPair: { exerciseA: Exercise; exerciseB: Exercise };
}

export default function WorkoutTimer({ selectedPair }: WorkoutTimerProps) {
  const [timeRemaining, setTimeRemaining] = useState(150); // 2:30 default
  const [isRunning, setIsRunning] = useState(false);
  const [currentSet, setCurrentSet] = useState(1);
  const [totalSets] = useState(4);
  const [completedSets, setCompletedSets] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    
    if (isRunning && timeRemaining > 0) {
      interval = setInterval(() => {
        setTimeRemaining(time => {
          if (time <= 1) {
            setIsRunning(false);
            // Timer completed notification could be added here
            return 0;
          }
          return time - 1;
        });
      }, 1000);
    }
    
    return () => clearInterval(interval);
  }, [isRunning, timeRemaining]);

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const toggleTimer = () => {
    setIsRunning(!isRunning);
  };

  const resetTimer = () => {
    setIsRunning(false);
    setTimeRemaining(150);
  };

  const stopTimer = () => {
    setIsRunning(false);
    setTimeRemaining(0);
  };

  const completeSet = () => {
    setCompletedSets(prev => Math.min(prev + 1, totalSets));
    if (currentSet < totalSets) {
      setCurrentSet(prev => prev + 1);
      resetTimer();
    }
  };

  const skipRest = () => {
    setIsRunning(false);
    setTimeRemaining(0);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Workout Timer</CardTitle>
          <Button variant="ghost" size="icon" className="text-gray-400 hover:text-gray-600">
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Pair Display */}
        <div className="text-center">
          <div className="text-sm text-gray-500 mb-2">Current Superset</div>
          <div className="text-lg font-semibold text-gray-900">
            {selectedPair.exerciseA.name} + {selectedPair.exerciseB.name}
          </div>
        </div>

        {/* Timer Display */}
        <div className="text-center">
          <div className="text-6xl font-mono font-bold text-gray-900 mb-2">
            {formatTime(timeRemaining)}
          </div>
          <div className="text-sm text-gray-500">Rest Between Sets</div>
        </div>
        
        {/* Timer Controls */}
        <div className="flex items-center justify-center space-x-4">
          <Button
            variant="outline"
            size="icon"
            onClick={resetTimer}
            className="w-12 h-12 rounded-full"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
          <Button
            onClick={toggleTimer}
            className="w-16 h-16 rounded-full bg-primary hover:bg-primary/90"
          >
            {isRunning ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={stopTimer}
            className="w-12 h-12 rounded-full"
          >
            <Square className="w-4 h-4" />
          </Button>
        </div>
        
        {/* Current Set Info */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-lg font-semibold text-gray-900">{currentSet}</div>
            <div className="text-xs text-gray-500">Current Set</div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-lg font-semibold text-gray-900">{totalSets}</div>
            <div className="text-xs text-gray-500">Total Sets</div>
          </div>
          <div className="p-3 bg-gray-50 rounded-lg">
            <div className="text-lg font-semibold text-gray-900">{completedSets}</div>
            <div className="text-xs text-gray-500">Completed</div>
          </div>
        </div>
        
        {/* Quick Actions */}
        <div className="flex space-x-3">
          <Button 
            onClick={completeSet}
            disabled={completedSets >= totalSets}
            className="flex-1 bg-secondary text-secondary-foreground hover:bg-secondary/90"
          >
            Complete Set
          </Button>
          <Button 
            variant="outline"
            onClick={skipRest}
            className="flex-1"
          >
            Skip Rest
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
