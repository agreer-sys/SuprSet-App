import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, Dumbbell, MessageSquare, Play, AlertCircle } from "lucide-react";

interface ExecutionStep {
  step?: number;
  atMs: number;
  endMs: number;
  type: 'work' | 'rest' | 'await_ready' | 'form_cue' | 'transition' | 'instruction' | 'hold';
  blockId?: string;
  blockName?: string;
  text?: string;
  label?: string;
  exerciseId?: number;
  exerciseName?: string;
  durationSec?: number;
  message?: string;
  set?: number;
  round?: number;
  preWorkout?: boolean;
  exercise?: {
    id: number;
    name: string;
    cues: string[];
    equipment: string[];
    muscleGroup: string;
  };
  coachContext?: {
    primaryMuscleGroup?: string;
    movementPattern?: string;
    equipmentPrimary?: string;
    coachingBulletPoints?: string[];
  };
}

interface TimelinePreviewProps {
  steps: ExecutionStep[];
  title?: string;
}

export function TimelinePreview({ steps, title = "Workout Timeline" }: TimelinePreviewProps) {
  // Calculate pre-workout offset to adjust displayed times
  const preWorkoutDurationMs = steps
    .filter(step => step.preWorkout)
    .reduce((sum, step) => sum + (step.endMs - step.atMs), 0);

  const formatTime = (ms: number, isPreWorkout: boolean = false) => {
    if (isPreWorkout) {
      return "Ready...";
    }
    const adjustedMs = ms - preWorkoutDurationMs;
    const totalSeconds = Math.floor(adjustedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const getDuration = (step: ExecutionStep) => {
    return Math.floor((step.endMs - step.atMs) / 1000);
  };

  const getStepIcon = (type: string) => {
    switch (type) {
      case 'work':
        return <Dumbbell className="w-4 h-4" />;
      case 'rest':
        return <Clock className="w-4 h-4" />;
      case 'await_ready':
        return <Play className="w-4 h-4" />;
      case 'form_cue':
        return <MessageSquare className="w-4 h-4" />;
      case 'transition':
        return <AlertCircle className="w-4 h-4" />;
      default:
        return null;
    }
  };

  const getStepBadgeVariant = (type: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (type) {
      case 'work':
        return 'default';
      case 'rest':
        return 'secondary';
      case 'await_ready':
        return 'outline';
      case 'form_cue':
        return 'outline';
      case 'transition':
        return 'secondary';
      default:
        return 'default';
    }
  };

  const totalDuration = steps.length > 0 ? steps[steps.length - 1].endMs - preWorkoutDurationMs : 0;
  
  // Track block changes for visual separators
  let lastBlockId: string | undefined = undefined;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{title}</span>
          <Badge variant="outline" className="text-sm">
            {formatTime(totalDuration)} total
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-2">
            {steps.map((step, index) => {
              // Check for block change
              const isNewBlock = step.blockId && step.blockId !== lastBlockId;
              if (step.blockId) {
                lastBlockId = step.blockId;
              }
              
              return (
                <div key={index}>
                  {/* Block Title Separator */}
                  {isNewBlock && step.blockName && (
                    <div className="bg-primary/10 border-l-4 border-primary px-4 py-2 mb-2 rounded">
                      <p className="font-semibold text-sm">📋 {step.blockName}</p>
                    </div>
                  )}
                  
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-start text-left h-auto py-3 px-4 hover:bg-accent"
                        data-testid={`timeline-step-${index}`}
                      >
                        <div className="flex items-start gap-3 w-full">
                          <div className="flex items-center gap-2 min-w-[80px]">
                            {getStepIcon(step.type)}
                            <span className="text-xs text-muted-foreground">
                              {formatTime(step.atMs, step.preWorkout)}
                            </span>
                          </div>
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant={getStepBadgeVariant(step.type)} className="text-xs">
                            {step.type}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {getDuration(step)}s
                          </span>
                        </div>
                        
                        {(step.exerciseName || step.exercise?.name) && (
                          <div>
                            <p className="font-medium">{step.exerciseName || step.exercise?.name}</p>
                            {(step.set || step.round) && (
                              <p className="text-xs text-muted-foreground">
                                Set {step.set} {step.round && `• Exercise ${step.round}`}
                              </p>
                            )}
                          </div>
                        )}
                        {(step.message || step.text || step.label) && (
                          <p className="text-sm text-muted-foreground">
                            {step.message || step.text || step.label}
                          </p>
                        )}
                      </div>
                    </div>
                  </Button>
                </DialogTrigger>
                
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Step {index + 1} Details</DialogTitle>
                  </DialogHeader>
                  
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium">Type</p>
                        <Badge variant={getStepBadgeVariant(step.type)}>
                          {step.type}
                        </Badge>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Duration</p>
                        <p className="text-sm text-muted-foreground">
                          {getDuration(step)} seconds
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">Start Time</p>
                        <p className="text-sm text-muted-foreground">
                          {formatTime(step.atMs)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">End Time</p>
                        <p className="text-sm text-muted-foreground">
                          {formatTime(step.endMs)}
                        </p>
                      </div>
                    </div>

                    {(step.exerciseName || step.exercise) && (
                      <>
                        <div>
                          <p className="text-sm font-medium mb-1">Exercise</p>
                          <p className="text-lg font-semibold">
                            {step.exerciseName || step.exercise?.name}
                          </p>
                          {(step.exerciseId || step.exercise?.id) && (
                            <p className="text-xs text-muted-foreground">
                              ID: {step.exerciseId || step.exercise?.id}
                            </p>
                          )}
                          {(step.set || step.round) && (
                            <p className="text-sm text-muted-foreground mt-1">
                              Set {step.set} {step.round && `• Exercise ${step.round}`}
                            </p>
                          )}
                        </div>

                        {(step.exercise || step.coachContext) && (
                          <div className="border-t pt-4">
                            <p className="text-sm font-medium mb-2">Exercise Details</p>
                            <div className="grid grid-cols-2 gap-3">
                              {(step.exercise?.muscleGroup || step.coachContext?.primaryMuscleGroup) && (
                                <div>
                                  <p className="text-xs text-muted-foreground">Primary Muscle</p>
                                  <p className="text-sm">
                                    {step.exercise?.muscleGroup || step.coachContext?.primaryMuscleGroup}
                                  </p>
                                </div>
                              )}
                              {step.coachContext?.movementPattern && (
                                <div>
                                  <p className="text-xs text-muted-foreground">Movement Pattern</p>
                                  <p className="text-sm">{step.coachContext.movementPattern}</p>
                                </div>
                              )}
                              {(step.exercise?.equipment?.[0] || step.coachContext?.equipmentPrimary) && (
                                <div>
                                  <p className="text-xs text-muted-foreground">Equipment</p>
                                  <p className="text-sm">
                                    {step.exercise?.equipment?.[0] || step.coachContext?.equipmentPrimary}
                                  </p>
                                </div>
                              )}
                            </div>
                            
                            {(step.exercise?.cues || step.coachContext?.coachingBulletPoints) && 
                             (step.exercise?.cues?.length || step.coachContext?.coachingBulletPoints?.length) && (
                              <div className="mt-3">
                                <p className="text-xs text-muted-foreground mb-1">Coaching Points</p>
                                <ul className="text-sm list-disc list-inside space-y-1">
                                  {(step.exercise?.cues || step.coachContext?.coachingBulletPoints || []).map((point, i) => (
                                    <li key={i}>{point}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}

                    {step.message && (
                      <div>
                        <p className="text-sm font-medium mb-1">Message</p>
                        <p className="text-sm text-muted-foreground">{step.message}</p>
                      </div>
                    )}

                    {step.blockId && (
                      <div className="bg-muted p-3 rounded-lg">
                        <p className="text-xs font-medium mb-1">Block ID</p>
                        <code className="text-xs">{step.blockId}</code>
                      </div>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
