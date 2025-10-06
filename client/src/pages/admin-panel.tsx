import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, Save, Eye, GripVertical, ArrowUp, ArrowDown } from "lucide-react";
import type { Exercise } from "@shared/schema";
import { TimelinePreview } from "@/components/TimelinePreview";

interface BlockParams {
  type: "work" | "rest" | "await_ready" | "form_cue" | "transition";
  durationMs?: number;
  exerciseId?: number;
  cueText?: string;
  cueAudioText?: string;
}

interface Block {
  id: string;
  name: string;
  description: string;
  params: BlockParams;
  exercises: number[];
}

interface ExecutionStep {
  atMs: number;
  endMs: number;
  type: 'work' | 'rest' | 'await_ready' | 'form_cue' | 'transition';
  blockId: string;
  exerciseId?: number;
  exerciseName?: string;
  durationSec?: number;
  message?: string;
  coachContext?: {
    primaryMuscleGroup?: string;
    movementPattern?: string;
    equipmentPrimary?: string;
    coachingBulletPoints?: string[];
  };
}

export default function AdminPanel() {
  const { toast } = useToast();
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [currentBlock, setCurrentBlock] = useState<Partial<Block>>({
    params: { type: "work" }
  });
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [showTimelinePreview, setShowTimelinePreview] = useState(false);
  const [compiledTimeline, setCompiledTimeline] = useState<ExecutionStep[]>([]);
  const [draggedBlockIndex, setDraggedBlockIndex] = useState<number | null>(null);
  const [workoutName, setWorkoutName] = useState("");
  const [workoutDescription, setWorkoutDescription] = useState("");

  // Check if user is admin
  const { data: adminStatus, isLoading: checkingAdmin } = useQuery<{ isAdmin: boolean }>({
    queryKey: ['/api/auth/is-admin'],
  });

  // Fetch exercises from Airtable
  const { data: exercises, isLoading: loadingExercises } = useQuery<Exercise[]>({
    queryKey: ['/api/exercises'],
  });

  // Save workout mutation
  const saveWorkoutMutation = useMutation({
    mutationFn: async () => {
      if (!workoutName) {
        throw new Error("Workout name is required");
      }
      if (blocks.length === 0) {
        throw new Error("Add at least one block");
      }

      return await apiRequest("POST", "/api/admin/block-workouts", {
        name: workoutName,
        description: workoutDescription,
        blocks: blocks
      });
    },
    onSuccess: (data: any) => {
      toast({
        title: "Workout saved!",
        description: `${data.name} has been created successfully`
      });
      // Reset form
      setBlocks([]);
      setWorkoutName("");
      setWorkoutDescription("");
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save workout",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  if (checkingAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Checking authorization...</h2>
        </div>
      </div>
    );
  }

  if (!adminStatus?.isAdmin) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>Access Denied</CardTitle>
            <CardDescription>
              You need admin privileges to access the workout builder.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/">
              <Button className="w-full" data-testid="button-back-home">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Home
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filteredExercises = exercises?.filter(ex =>
    ex.name.toLowerCase().includes(exerciseSearch.toLowerCase())
  );

  const addBlock = () => {
    if (!currentBlock.name || !currentBlock.params?.type) {
      toast({
        title: "Missing information",
        description: "Please provide block name and type",
        variant: "destructive"
      });
      return;
    }

    const newBlock: Block = {
      id: Math.random().toString(36).substr(2, 9),
      name: currentBlock.name || "",
      description: currentBlock.description || "",
      params: currentBlock.params as BlockParams,
      exercises: currentBlock.exercises || []
    };

    setBlocks([...blocks, newBlock]);
    setCurrentBlock({ params: { type: "work" } });
    toast({
      title: "Block added",
      description: `${newBlock.name} has been added to the workout`
    });
  };

  const removeBlock = (id: string) => {
    setBlocks(blocks.filter(b => b.id !== id));
  };

  const duplicateBlock = (block: Block) => {
    const duplicate: Block = {
      ...block,
      id: Math.random().toString(36).substr(2, 9),
      name: `${block.name} (Copy)`
    };
    setBlocks([...blocks, duplicate]);
    toast({
      title: "Block duplicated",
      description: `${block.name} has been duplicated`
    });
  };

  const addExerciseToBlock = (exerciseId: number) => {
    setCurrentBlock({
      ...currentBlock,
      exercises: [...(currentBlock.exercises || []), exerciseId]
    });
    setShowExercisePicker(false);
    toast({
      title: "Exercise added",
      description: "Exercise added to current block"
    });
  };

  const getExerciseName = (exerciseId: number) => {
    return exercises?.find(ex => ex.id === exerciseId)?.name || "Unknown";
  };

  const handleDragStart = (index: number) => {
    setDraggedBlockIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedBlockIndex(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (dropIndex: number) => {
    if (draggedBlockIndex === null) return;
    
    const newBlocks = [...blocks];
    const draggedBlock = newBlocks[draggedBlockIndex];
    newBlocks.splice(draggedBlockIndex, 1);
    newBlocks.splice(dropIndex, 0, draggedBlock);
    
    setBlocks(newBlocks);
    setDraggedBlockIndex(null);
    
    toast({
      title: "Block reordered",
      description: "Workout sequence updated"
    });
  };

  const moveBlockUp = (index: number) => {
    if (index === 0) return;
    const newBlocks = [...blocks];
    [newBlocks[index - 1], newBlocks[index]] = [newBlocks[index], newBlocks[index - 1]];
    setBlocks(newBlocks);
  };

  const moveBlockDown = (index: number) => {
    if (index === blocks.length - 1) return;
    const newBlocks = [...blocks];
    [newBlocks[index], newBlocks[index + 1]] = [newBlocks[index + 1], newBlocks[index]];
    setBlocks(newBlocks);
  };

  const compileTimeline = () => {
    if (blocks.length === 0) {
      toast({
        title: "No blocks to compile",
        description: "Add some blocks first",
        variant: "destructive"
      });
      return;
    }

    const steps: ExecutionStep[] = [];
    let currentTimeMs = 0;

    blocks.forEach((block) => {
      const durationMs = block.params.durationMs || 0;
      const exercise = block.exercises[0] ? exercises?.find(ex => ex.id === block.exercises[0]) : undefined;

      const step: ExecutionStep = {
        atMs: currentTimeMs,
        endMs: currentTimeMs + durationMs,
        type: block.params.type,
        blockId: block.id,
        durationSec: Math.floor(durationMs / 1000),
      };

      if (exercise) {
        step.exerciseId = exercise.id;
        step.exerciseName = exercise.name;
        step.coachContext = {
          primaryMuscleGroup: exercise.primaryMuscleGroup || undefined,
          movementPattern: exercise.movementPattern || undefined,
          equipmentPrimary: exercise.equipmentPrimary || exercise.equipment,
          coachingBulletPoints: exercise.coachingBulletPoints
            ? exercise.coachingBulletPoints.split(/[\n;]/).map(c => c.trim()).filter(c => c.length > 0)
            : undefined
        };
      }

      if (block.params.cueText) {
        step.message = block.params.cueText;
      }

      if (block.params.type === "await_ready") {
        step.message = "Waiting for ready signal...";
      }

      steps.push(step);
      currentTimeMs += durationMs;
    });

    setCompiledTimeline(steps);
    setShowTimelinePreview(true);
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">
              Admin Workout Builder
            </h1>
            <p className="text-muted-foreground">
              Create flexible block-based workouts with parameter-driven timing
            </p>
          </div>
          <Link href="/">
            <Button variant="outline" data-testid="button-back">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Block Builder Form */}
          <Card data-testid="card-block-builder">
            <CardHeader>
              <CardTitle>Build Block</CardTitle>
              <CardDescription>
                Define parameters for a workout block
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="block-name">Block Name</Label>
                <Input
                  id="block-name"
                  data-testid="input-block-name"
                  value={currentBlock.name || ""}
                  onChange={(e) => setCurrentBlock({ ...currentBlock, name: e.target.value })}
                  placeholder="e.g., Main Work Set"
                />
              </div>

              <div>
                <Label htmlFor="block-description">Description (Optional)</Label>
                <Textarea
                  id="block-description"
                  data-testid="input-block-description"
                  value={currentBlock.description || ""}
                  onChange={(e) => setCurrentBlock({ ...currentBlock, description: e.target.value })}
                  placeholder="Brief description of this block"
                  rows={2}
                />
              </div>

              <div>
                <Label htmlFor="block-type">Block Type</Label>
                <Select
                  value={currentBlock.params?.type}
                  onValueChange={(value) => setCurrentBlock({
                    ...currentBlock,
                    params: { ...currentBlock.params, type: value as BlockParams['type'] }
                  })}
                >
                  <SelectTrigger id="block-type" data-testid="select-block-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="work">Work Period</SelectItem>
                    <SelectItem value="rest">Rest Period</SelectItem>
                    <SelectItem value="await_ready">Wait for User Ready</SelectItem>
                    <SelectItem value="form_cue">Form/Coaching Cue</SelectItem>
                    <SelectItem value="transition">Transition Time</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {(currentBlock.params?.type === "work" || 
                currentBlock.params?.type === "rest" || 
                currentBlock.params?.type === "transition") && (
                <div>
                  <Label htmlFor="duration">Duration (seconds)</Label>
                  <Input
                    id="duration"
                    data-testid="input-duration"
                    type="number"
                    value={currentBlock.params?.durationMs ? currentBlock.params.durationMs / 1000 : ""}
                    onChange={(e) => setCurrentBlock({
                      ...currentBlock,
                      params: { 
                        ...currentBlock.params, 
                        type: currentBlock.params?.type!,
                        durationMs: parseInt(e.target.value) * 1000 
                      }
                    })}
                    placeholder="30"
                  />
                </div>
              )}

              {(currentBlock.params?.type === "work" || currentBlock.params?.type === "form_cue") && (
                <div>
                  <Label>Exercise</Label>
                  <div className="space-y-2">
                    {currentBlock.exercises?.map((exId) => (
                      <div key={exId} className="flex items-center justify-between p-2 bg-muted rounded">
                        <span className="text-sm">{getExerciseName(exId)}</span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setCurrentBlock({
                            ...currentBlock,
                            exercises: currentBlock.exercises?.filter(id => id !== exId)
                          })}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      className="w-full"
                      data-testid="button-add-exercise"
                      onClick={() => setShowExercisePicker(true)}
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Exercise
                    </Button>
                  </div>
                </div>
              )}

              {currentBlock.params?.type === "form_cue" && (
                <>
                  <div>
                    <Label htmlFor="cue-text">Cue Text (Display)</Label>
                    <Input
                      id="cue-text"
                      data-testid="input-cue-text"
                      value={currentBlock.params?.cueText || ""}
                      onChange={(e) => setCurrentBlock({
                        ...currentBlock,
                        params: { 
                          ...currentBlock.params,
                          type: currentBlock.params?.type!,
                          cueText: e.target.value 
                        }
                      })}
                      placeholder="Keep your core engaged"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cue-audio">Cue Audio Text (Coach will say this)</Label>
                    <Textarea
                      id="cue-audio"
                      data-testid="input-cue-audio"
                      value={currentBlock.params?.cueAudioText || ""}
                      onChange={(e) => setCurrentBlock({
                        ...currentBlock,
                        params: { 
                          ...currentBlock.params,
                          type: currentBlock.params?.type!,
                          cueAudioText: e.target.value 
                        }
                      })}
                      placeholder="Remember to keep your core engaged throughout the movement"
                      rows={2}
                    />
                  </div>
                </>
              )}

              <div className="flex gap-2">
                <Button
                  onClick={addBlock}
                  className="flex-1"
                  data-testid="button-add-block"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Block
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setCurrentBlock({ params: { type: "work" } })}
                  data-testid="button-clear-form"
                >
                  Clear
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Workout Preview */}
          <Card data-testid="card-workout-preview">
            <CardHeader>
              <CardTitle>Workout Blocks ({blocks.length})</CardTitle>
              <CardDescription>
                Preview and manage your workout sequence
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {blocks.length > 0 && (
                <div className="space-y-3 border-b pb-4">
                  <div>
                    <Label htmlFor="workout-name">Workout Name *</Label>
                    <Input
                      id="workout-name"
                      data-testid="input-workout-name"
                      value={workoutName}
                      onChange={(e) => setWorkoutName(e.target.value)}
                      placeholder="e.g., Upper Body Power"
                    />
                  </div>
                  <div>
                    <Label htmlFor="workout-description">Description</Label>
                    <Textarea
                      id="workout-description"
                      data-testid="input-workout-description"
                      value={workoutDescription}
                      onChange={(e) => setWorkoutDescription(e.target.value)}
                      placeholder="Brief description of this workout"
                      rows={2}
                    />
                  </div>
                </div>
              )}
              
              {blocks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>No blocks added yet</p>
                  <p className="text-sm">Build blocks on the left to start creating your workout</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {blocks.map((block, index) => (
                    <div
                      key={block.id}
                      draggable
                      onDragStart={() => handleDragStart(index)}
                      onDragEnd={handleDragEnd}
                      onDragOver={handleDragOver}
                      onDrop={() => handleDrop(index)}
                      className={`p-4 border rounded-lg transition-colors ${
                        draggedBlockIndex === index 
                          ? 'opacity-50 bg-muted' 
                          : 'hover:bg-muted/50 cursor-move'
                      }`}
                      data-testid={`block-item-${index}`}
                    >
                      <div className="flex items-start gap-2 mb-2">
                        <div className="flex flex-col gap-1 mt-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => moveBlockUp(index)}
                            disabled={index === 0}
                            data-testid={`button-move-up-${index}`}
                          >
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <GripVertical className="h-4 w-4 text-muted-foreground" />
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={() => moveBlockDown(index)}
                            disabled={index === blocks.length - 1}
                            data-testid={`button-move-down-${index}`}
                          >
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="font-semibold">{index + 1}. {block.name}</h3>
                              <p className="text-sm text-muted-foreground">{block.params.type}</p>
                            </div>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => duplicateBlock(block)}
                                data-testid={`button-duplicate-${index}`}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => removeBlock(block.id)}
                                data-testid={`button-remove-${index}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                      {block.description && (
                        <p className="text-sm mb-2">{block.description}</p>
                      )}
                      {block.params.durationMs && (
                        <p className="text-sm text-muted-foreground">
                          Duration: {block.params.durationMs / 1000}s
                        </p>
                      )}
                      {block.exercises.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-muted-foreground mb-1">Exercises:</p>
                          {block.exercises.map(exId => (
                            <span key={exId} className="text-xs bg-primary/10 px-2 py-1 rounded mr-1">
                              {getExerciseName(exId)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {blocks.length > 0 && (
                <div className="mt-4 flex gap-2">
                  <Button 
                    className="flex-1" 
                    data-testid="button-save-workout"
                    onClick={() => saveWorkoutMutation.mutate()}
                    disabled={saveWorkoutMutation.isPending || !workoutName}
                  >
                    <Save className="mr-2 h-4 w-4" />
                    {saveWorkoutMutation.isPending ? "Saving..." : "Save Workout"}
                  </Button>
                  <Button 
                    variant="outline" 
                    data-testid="button-preview-timeline"
                    onClick={compileTimeline}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    Preview Timeline
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Exercise Picker Modal */}
      {showExercisePicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <Card className="w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
            <CardHeader>
              <CardTitle>Select Exercise</CardTitle>
              <CardDescription>
                Choose an exercise from Airtable catalog
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden flex flex-col">
              <Input
                placeholder="Search exercises..."
                value={exerciseSearch}
                onChange={(e) => setExerciseSearch(e.target.value)}
                className="mb-4"
                data-testid="input-exercise-search"
              />
              <div className="flex-1 overflow-y-auto space-y-2">
                {loadingExercises ? (
                  <p className="text-center py-8">Loading exercises...</p>
                ) : filteredExercises && filteredExercises.length > 0 ? (
                  filteredExercises.map((exercise) => (
                    <div
                      key={exercise.id}
                      className="p-3 border rounded hover:bg-muted cursor-pointer transition-colors"
                      onClick={() => addExerciseToBlock(exercise.id)}
                      data-testid={`exercise-item-${exercise.id}`}
                    >
                      <h4 className="font-medium">{exercise.name}</h4>
                      <p className="text-sm text-muted-foreground">
                        {exercise.primaryMuscleGroup} • {exercise.equipmentPrimary || exercise.equipment}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-center py-8 text-muted-foreground">No exercises found</p>
                )}
              </div>
              <div className="mt-4">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setShowExercisePicker(false)}
                  data-testid="button-close-picker"
                >
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Timeline Preview Dialog */}
      <Dialog open={showTimelinePreview} onOpenChange={setShowTimelinePreview}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Compiled Workout Timeline</DialogTitle>
          </DialogHeader>
          <TimelinePreview 
            steps={compiledTimeline} 
            title="Block Sequence Preview"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
