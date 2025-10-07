import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, Save, Eye, GripVertical, ArrowUp, ArrowDown, Edit, Copy, Power, PowerOff, Clock } from "lucide-react";
import type { Exercise } from "@shared/schema";
import { TimelinePreview } from "@/components/TimelinePreview";

interface BlockParams {
  setsPerExercise?: number;
  workSec?: number;
  restSec?: number;
  roundRestSec?: number;
  transitionSec?: number;
  awaitReadyBeforeStart?: boolean;
  [key: string]: any;
}

interface BlockExercise {
  exerciseId: number;
  orderIndex: number;
  workSec?: number;
  restSec?: number;
  targetReps?: string; // Text to support ranges like "12-15", "10 each leg"
}

interface Block {
  id: string;
  name: string;
  description: string;
  type: string;
  params: BlockParams;
  exercises: BlockExercise[];
}

type WorkoutPattern = "superset" | "straight_sets" | "circuit" | "transition" | "custom";

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

// Manage Workouts Tab Component
function ManageWorkoutsTab({ onEditWorkout }: { onEditWorkout: (id: number) => void }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [workoutToDelete, setWorkoutToDelete] = useState<number | null>(null);

  // Fetch all workouts (admin)
  const { data: workouts, isLoading } = useQuery({
    queryKey: ['/api/admin/block-workouts'],
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/admin/block-workouts/${id}`, "DELETE");
    },
    onSuccess: () => {
      toast({ title: "Workout deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/block-workouts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/block-workouts'] });
      setWorkoutToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: "Delete failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Publish toggle mutation
  const togglePublishMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/admin/block-workouts/${id}/publish`, "PATCH");
    },
    onSuccess: () => {
      toast({ title: "Publish status updated" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/block-workouts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/block-workouts'] });
    },
    onError: (error: any) => {
      toast({
        title: "Update failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Duplicate mutation
  const duplicateMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest(`/api/admin/block-workouts/${id}/duplicate`, "POST");
    },
    onSuccess: (data: any) => {
      toast({
        title: "Workout duplicated",
        description: `Created "${data.name}"`
      });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/block-workouts'] });
    },
    onError: (error: any) => {
      toast({
        title: "Duplicate failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  if (isLoading) {
    return <div className="text-center py-12">Loading workouts...</div>;
  }

  const workoutsList = Array.isArray(workouts) ? workouts : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>All Workouts</CardTitle>
          <CardDescription>
            Manage your block workouts - edit, delete, publish, or duplicate
          </CardDescription>
        </CardHeader>
        <CardContent>
          {workoutsList.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No workouts created yet. Create one in the "Create Workout" tab.
            </div>
          ) : (
            <div className="space-y-2">
              {workoutsList.map((workout: any) => (
                <div
                  key={workout.id}
                  className="border rounded-lg p-4 flex items-center justify-between gap-4"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold">{workout.name}</h3>
                      <Badge variant={workout.isPublished ? "default" : "secondary"}>
                        {workout.isPublished ? "Published" : "Draft"}
                      </Badge>
                    </div>
                    {workout.description && (
                      <p className="text-sm text-muted-foreground mb-2">
                        {workout.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {workout.estimatedDurationMin}min
                      </span>
                      <span>{workout.blockSequence?.length || 0} blocks</span>
                      <span>
                        Created {new Date(workout.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => togglePublishMutation.mutate(workout.id)}
                      disabled={togglePublishMutation.isPending}
                    >
                      {workout.isPublished ? (
                        <PowerOff className="h-4 w-4 mr-1" />
                      ) : (
                        <Power className="h-4 w-4 mr-1" />
                      )}
                      {workout.isPublished ? "Unpublish" : "Publish"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => duplicateMutation.mutate(workout.id)}
                      disabled={duplicateMutation.isPending}
                    >
                      <Copy className="h-4 w-4 mr-1" />
                      Duplicate
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onEditWorkout(workout.id)}
                    >
                      <Edit className="h-4 w-4 mr-1" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => setWorkoutToDelete(workout.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={workoutToDelete !== null} onOpenChange={() => setWorkoutToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Workout?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this workout. Active sessions can still complete, but new sessions cannot be started.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => workoutToDelete && deleteMutation.mutate(workoutToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function AdminPanel() {
  const { toast } = useToast();
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [currentBlock, setCurrentBlock] = useState<Partial<Block>>({
    type: "custom_sequence",
    params: { setsPerExercise: 3, workSec: 45, restSec: 10, roundRestSec: 0 },
    exercises: []
  });
  const [selectedPattern, setSelectedPattern] = useState<WorkoutPattern>("superset");
  const [workType, setWorkType] = useState<"time" | "reps">("time");
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [exerciseSearch, setExerciseSearch] = useState("");
  const [showTimelinePreview, setShowTimelinePreview] = useState(false);
  const [showBlockPreview, setShowBlockPreview] = useState(false);
  const [compiledTimeline, setCompiledTimeline] = useState<ExecutionStep[]>([]);
  const [draggedBlockIndex, setDraggedBlockIndex] = useState<number | null>(null);
  const [workoutName, setWorkoutName] = useState("");
  const [workoutDescription, setWorkoutDescription] = useState("");
  const [editingWorkoutId, setEditingWorkoutId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState("create");

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

      // Transform blocks to match backend API format
      const transformedBlocks = blocks.map(block => ({
        id: block.id,
        name: block.name,
        description: block.description,
        type: block.type,
        params: block.params,
        exercises: block.exercises.map(ex => ex.exerciseId) // Extract just the IDs
      }));

      if (editingWorkoutId) {
        // Update existing workout
        return await apiRequest(`/api/admin/block-workouts/${editingWorkoutId}`, "PATCH", {
          name: workoutName,
          description: workoutDescription,
          blocks: transformedBlocks
        });
      } else {
        // Create new workout
        return await apiRequest("/api/admin/block-workouts", "POST", {
          name: workoutName,
          description: workoutDescription,
          blocks: transformedBlocks
        });
      }
    },
    onSuccess: (data: any) => {
      toast({
        title: editingWorkoutId ? "Workout updated!" : "Workout saved!",
        description: `${data.name} has been ${editingWorkoutId ? 'updated' : 'created'} successfully`
      });
      // Reset form
      setBlocks([]);
      setWorkoutName("");
      setWorkoutDescription("");
      setEditingWorkoutId(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to save workout",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Load workout for editing using React Query mutation for proper error handling
  const loadWorkoutMutation = useMutation({
    mutationFn: async (workoutId: number) => {
      const response = await fetch(`/api/admin/block-workouts/${workoutId}/edit`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Failed to fetch workout');
      }
      return await response.json();
    },
    onSuccess: (data) => {
      // Populate workout fields
      setWorkoutName(data.name);
      setWorkoutDescription(data.description || "");
      
      // Transform blocks back to UI format with full exercise objects
      const transformedBlocks = data.blocks.map((block: any) => ({
        id: block.id,
        name: block.name,
        description: block.description || "",
        type: block.type,
        params: block.params,
        exercises: block.exercises.map((ex: any) => ({
          exerciseId: ex.exerciseId,
          targetReps: ex.targetReps,
          workSec: ex.workSec,
          restSec: ex.restSec
        }))
      }));
      
      setBlocks(transformedBlocks);
      setEditingWorkoutId(data.id);
      setActiveTab("create");
      
      toast({
        title: "Workout loaded",
        description: "You can now edit this workout"
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to load workout",
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
    if (!currentBlock.name) {
      toast({
        title: "Missing information",
        description: "Please provide block name",
        variant: "destructive"
      });
      return;
    }

    // Transition blocks don't require exercises
    if (currentBlock.type !== "transition" && (!currentBlock.exercises || currentBlock.exercises.length === 0)) {
      toast({
        title: "Missing exercises",
        description: "Please add at least one exercise to the block",
        variant: "destructive"
      });
      return;
    }

    const newBlock: Block = {
      id: Math.random().toString(36).substr(2, 9),
      name: currentBlock.name || "",
      description: currentBlock.description || "",
      type: currentBlock.type || "custom_sequence",
      params: currentBlock.params || {},
      exercises: currentBlock.exercises || []
    };

    setBlocks([...blocks, newBlock]);
    setCurrentBlock({ 
      type: "custom_sequence",
      params: { setsPerExercise: 3, workSec: 45, restSec: 10, roundRestSec: 0 },
      exercises: []
    });
    setSelectedPattern("superset");
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
    const newExercise: BlockExercise = {
      exerciseId,
      orderIndex: (currentBlock.exercises || []).length,
      workSec: currentBlock.params?.workSec,
      restSec: currentBlock.params?.restSec
    };
    setCurrentBlock({
      ...currentBlock,
      exercises: [...(currentBlock.exercises || []), newExercise]
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

  const removeExerciseFromBlock = (orderIndex: number) => {
    setCurrentBlock({
      ...currentBlock,
      exercises: currentBlock.exercises?.filter((_, idx) => idx !== orderIndex)
    });
  };

  const applyPattern = (pattern: WorkoutPattern) => {
    setSelectedPattern(pattern);
    
    // Apply pattern-specific defaults
    switch (pattern) {
      case "superset":
        setCurrentBlock({
          ...currentBlock,
          type: "custom_sequence",
          params: {
            pattern: "superset", // Save pattern for compiler
            setsPerExercise: 3,
            workSec: 45,
            restSec: 10, // Minimal rest between exercises
            roundRestSec: 0,
            transitionSec: 0
          }
        });
        break;
      case "straight_sets":
        setCurrentBlock({
          ...currentBlock,
          type: "custom_sequence",
          params: {
            pattern: "straight_sets", // Save pattern for compiler
            setsPerExercise: 3,
            workSec: 45,
            restSec: 60, // Normal rest between sets
            roundRestSec: 0,
            transitionSec: 0
          }
        });
        break;
      case "circuit":
        setCurrentBlock({
          ...currentBlock,
          type: "custom_sequence",
          params: {
            pattern: "circuit", // Save pattern for compiler
            setsPerExercise: 3, // Number of rounds
            workSec: 40,
            restSec: 10, // Short rest between exercises
            roundRestSec: 90, // Longer rest between rounds
            transitionSec: 0
          }
        });
        break;
      case "transition":
        setCurrentBlock({
          ...currentBlock,
          type: "transition",
          params: {
            durationSec: 60 // Default 60 seconds rest/transition
          },
          exercises: [] // Transition blocks don't have exercises
        });
        break;
      case "custom":
        // Keep current params
        break;
    }
  };

  const getPatternDescription = (pattern: WorkoutPattern) => {
    switch (pattern) {
      case "superset":
        return "2-3 exercises with minimal rest, repeated for multiple sets";
      case "straight_sets":
        return "Same exercise repeated for multiple sets with full rest";
      case "circuit":
        return "Multiple exercises for 1 set each, then repeat the circuit";
      case "transition":
        return "Rest or transition period between workout blocks";
      case "custom":
        return "Fully customizable parameters";
    }
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

  const compileTimeline = async () => {
    if (blocks.length === 0) {
      toast({
        title: "No blocks to compile",
        description: "Add some blocks first",
        variant: "destructive"
      });
      return;
    }

    try {
      // Enrich blocks with exercise metadata before compilation
      const enrichedBlocks = blocks.map(block => ({
        ...block,
        exercises: block.exercises?.map(ex => {
          const exerciseData = exercises?.find(e => e.id === ex.exerciseId);
          return {
            ...ex,
            exerciseName: exerciseData?.name || 'Unknown Exercise',
            equipmentPrimary: exerciseData?.equipmentPrimary || exerciseData?.equipment,
            equipmentSecondary: exerciseData?.equipmentSecondary || [],
            primaryMuscleGroup: exerciseData?.primaryMuscleGroup,
            coachingBulletPoints: exerciseData?.coachingBulletPoints,
            videoUrl: exerciseData?.videoUrl,
            imageUrl: exerciseData?.imageUrl
          };
        }) || []
      }));
      
      const response = await fetch('/api/blocks/compile-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blocks: enrichedBlocks,
          workoutName: workoutName || "Workout Preview"
        })
      });

      if (!response.ok) {
        throw new Error('Failed to compile timeline');
      }

      const timeline = await response.json();
      setCompiledTimeline(timeline.executionTimeline || []);
      setShowTimelinePreview(true);
      
      toast({
        title: "Timeline compiled!",
        description: `${timeline.executionTimeline.length} steps from ${blocks.length} block${blocks.length > 1 ? 's' : ''}`
      });
    } catch (error: any) {
      toast({
        title: "Compilation failed",
        description: error.message,
        variant: "destructive"
      });
    }
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

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="create">Create Workout</TabsTrigger>
            <TabsTrigger value="manage">Manage Workouts</TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Block Builder Form */}
              <Card data-testid="card-block-builder">
            <CardHeader>
              <CardTitle>Build Block</CardTitle>
              <CardDescription>
                Define parameters for a workout block
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* 1. Name & Description */}
              <div className="space-y-4">
                <div>
                  <Label htmlFor="block-name">Block Name *</Label>
                  <Input
                    id="block-name"
                    data-testid="input-block-name"
                    value={currentBlock.name || ""}
                    onChange={(e) => setCurrentBlock({ ...currentBlock, name: e.target.value })}
                    placeholder="e.g., Push Superset"
                  />
                </div>

                <div>
                  <Label htmlFor="block-description">Description (Optional)</Label>
                  <Textarea
                    id="block-description"
                    data-testid="input-block-description"
                    value={currentBlock.description || ""}
                    onChange={(e) => setCurrentBlock({ ...currentBlock, description: e.target.value })}
                    placeholder="Brief description"
                    rows={2}
                  />
                </div>
              </div>

              {/* 2. Pattern Presets */}
              <div className="space-y-2">
                <Label>Workout Pattern</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={selectedPattern === "superset" ? "default" : "outline"}
                    onClick={() => applyPattern("superset")}
                    className="h-auto py-3 flex-col items-start"
                    data-testid="button-pattern-superset"
                  >
                    <span className="font-semibold">🔄 Superset</span>
                    <span className="text-xs text-left opacity-80">2-3 exercises, minimal rest</span>
                  </Button>
                  <Button
                    type="button"
                    variant={selectedPattern === "straight_sets" ? "default" : "outline"}
                    onClick={() => applyPattern("straight_sets")}
                    className="h-auto py-3 flex-col items-start"
                    data-testid="button-pattern-straight"
                  >
                    <span className="font-semibold">💪 Straight Sets</span>
                    <span className="text-xs text-left opacity-80">Same exercise, multiple sets</span>
                  </Button>
                  <Button
                    type="button"
                    variant={selectedPattern === "circuit" ? "default" : "outline"}
                    onClick={() => applyPattern("circuit")}
                    className="h-auto py-3 flex-col items-start"
                    data-testid="button-pattern-circuit"
                  >
                    <span className="font-semibold">🔁 Circuit</span>
                    <span className="text-xs text-left opacity-80">6+ exercises, rest between rounds</span>
                  </Button>
                  <Button
                    type="button"
                    variant={selectedPattern === "transition" ? "default" : "outline"}
                    onClick={() => applyPattern("transition")}
                    className="h-auto py-3 flex-col items-start"
                    data-testid="button-pattern-transition"
                  >
                    <span className="font-semibold">⏸️ Rest/Transition</span>
                    <span className="text-xs text-left opacity-80">Break between blocks</span>
                  </Button>
                  <Button
                    type="button"
                    variant={selectedPattern === "custom" ? "default" : "outline"}
                    onClick={() => applyPattern("custom")}
                    className="h-auto py-3 flex-col items-start"
                    data-testid="button-pattern-custom"
                  >
                    <span className="font-semibold">⚙️ Custom</span>
                    <span className="text-xs text-left opacity-80">Full control</span>
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{getPatternDescription(selectedPattern)}</p>
              </div>

              {/* 3. Add Exercises OR Duration for Transition */}
              {selectedPattern === "transition" ? (
                <div>
                  <Label htmlFor="transition-duration">Rest/Transition Duration (seconds)</Label>
                  <Input
                    id="transition-duration"
                    data-testid="input-transition-duration"
                    type="number"
                    min="10"
                    value={currentBlock.params?.durationSec || ""}
                    onChange={(e) => setCurrentBlock({
                      ...currentBlock,
                      params: { ...currentBlock.params, durationSec: Number(e.target.value) }
                    })}
                    placeholder="60"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Time for rest, water break, or transition between workout blocks
                  </p>
                </div>
              ) : (
                <div>
                  <Label>Exercises</Label>
                  <div className="space-y-2">
                    {currentBlock.exercises?.map((ex, idx) => (
                      <div key={idx} className="p-3 bg-muted rounded-lg space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <p className="text-sm font-medium">{getExerciseName(ex.exerciseId)}</p>
                            <p className="text-xs text-muted-foreground">
                              {ex.targetReps || currentBlock.params?.targetReps ? (
                                <>
                                  <strong>{ex.targetReps || currentBlock.params?.targetReps}</strong> reps · {ex.restSec || currentBlock.params?.restSec}s rest
                                </>
                              ) : (
                                <>
                                  {ex.workSec || currentBlock.params?.workSec}s work · {ex.restSec || currentBlock.params?.restSec}s rest
                                </>
                              )}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => removeExerciseFromBlock(idx)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        
                        {/* Exercise-level overrides */}
                        <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border/50">
                          {currentBlock.params?.targetReps ? (
                            <div>
                              <Label className="text-xs">Target Reps Override</Label>
                              <Input
                                type="text"
                                placeholder={currentBlock.params.targetReps}
                                value={ex.targetReps || ""}
                                onChange={(e) => {
                                  const updated = [...(currentBlock.exercises || [])];
                                  updated[idx] = { ...updated[idx], targetReps: e.target.value || undefined };
                                  setCurrentBlock({ ...currentBlock, exercises: updated });
                                }}
                                className="h-8 text-xs"
                              />
                            </div>
                          ) : (
                            <div>
                              <Label className="text-xs">Work Sec Override</Label>
                              <Input
                                type="number"
                                placeholder={String(currentBlock.params?.workSec || "")}
                                value={ex.workSec || ""}
                                onChange={(e) => {
                                  const updated = [...(currentBlock.exercises || [])];
                                  updated[idx] = { ...updated[idx], workSec: e.target.value ? Number(e.target.value) : undefined };
                                  setCurrentBlock({ ...currentBlock, exercises: updated });
                                }}
                                className="h-8 text-xs"
                              />
                            </div>
                          )}
                          <div>
                            <Label className="text-xs">Rest Sec Override</Label>
                            <Input
                              type="number"
                              placeholder={String(currentBlock.params?.restSec || "")}
                              value={ex.restSec || ""}
                              onChange={(e) => {
                                const updated = [...(currentBlock.exercises || [])];
                                updated[idx] = { ...updated[idx], restSec: e.target.value ? Number(e.target.value) : undefined };
                                setCurrentBlock({ ...currentBlock, exercises: updated });
                              }}
                              className="h-8 text-xs"
                            />
                          </div>
                          {!currentBlock.params?.targetReps && (
                            <div>
                              <Label className="text-xs">Target Reps Override</Label>
                              <Input
                                type="text"
                                placeholder="e.g., 12-15"
                                value={ex.targetReps || ""}
                                onChange={(e) => {
                                  const updated = [...(currentBlock.exercises || [])];
                                  updated[idx] = { ...updated[idx], targetReps: e.target.value || undefined };
                                  setCurrentBlock({ ...currentBlock, exercises: updated });
                                }}
                                className="h-8 text-xs"
                              />
                            </div>
                          )}
                        </div>
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

              {/* Parameters for workout blocks (not transitions) */}
              {selectedPattern !== "transition" && (
                <>
                  {/* 4. Sets/Rounds */}
                  <div>
                    <Label htmlFor="sets">
                      {selectedPattern === "circuit" ? "Rounds" : "Sets"} per Exercise
                    </Label>
                    <Input
                      id="sets"
                      data-testid="input-sets"
                      type="number"
                      min="1"
                      value={currentBlock.params?.setsPerExercise || ""}
                      onChange={(e) => setCurrentBlock({
                        ...currentBlock,
                        params: { ...currentBlock.params, setsPerExercise: Number(e.target.value) }
                      })}
                      placeholder="3"
                    />
                  </div>

                  {/* 5. Work: Time or Reps */}
              <div className="space-y-3">
                <div>
                  <Label>Work Type</Label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant={workType === "time" ? "default" : "outline"}
                      onClick={() => setWorkType("time")}
                      className="w-full"
                      data-testid="button-work-type-time"
                    >
                      ⏱️ Time-Based
                    </Button>
                    <Button
                      type="button"
                      variant={workType === "reps" ? "default" : "outline"}
                      onClick={() => setWorkType("reps")}
                      className="w-full"
                      data-testid="button-work-type-reps"
                    >
                      🔢 Rep-Based
                    </Button>
                  </div>
                </div>

                {workType === "time" ? (
                  <div>
                    <Label htmlFor="work-duration">Work Duration (seconds)</Label>
                    <Input
                      id="work-duration"
                      data-testid="input-work-duration"
                      type="number"
                      min="1"
                      value={currentBlock.params?.workSec || ""}
                      onChange={(e) => setCurrentBlock({
                        ...currentBlock,
                        params: { 
                          ...currentBlock.params, 
                          workSec: Number(e.target.value),
                          targetReps: undefined // Clear reps when using time
                        }
                      })}
                      placeholder="45"
                    />
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="target-reps">Target Reps (or range like "12-15")</Label>
                    <Input
                      id="target-reps"
                      data-testid="input-target-reps"
                      type="text"
                      value={currentBlock.params?.targetReps || ""}
                      onChange={(e) => setCurrentBlock({
                        ...currentBlock,
                        params: { 
                          ...currentBlock.params, 
                          targetReps: e.target.value,
                          workSec: undefined // Clear time when using reps
                        }
                      })}
                      placeholder="12 or 10-12"
                    />
                  </div>
                )}
              </div>

              {/* 6. Recovery Parameters */}
              <div className="space-y-3">
                <Label>Recovery</Label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="rest-duration" className="text-xs text-muted-foreground">
                      Rest Between Exercises (s)
                    </Label>
                    <Input
                      id="rest-duration"
                      data-testid="input-rest-duration"
                      type="number"
                      min="0"
                      value={currentBlock.params?.restSec ?? ""}
                      onChange={(e) => setCurrentBlock({
                        ...currentBlock,
                        params: { ...currentBlock.params, restSec: Number(e.target.value) }
                      })}
                      placeholder="10"
                    />
                  </div>
                  {selectedPattern === "circuit" && (
                    <div>
                      <Label htmlFor="round-rest" className="text-xs text-muted-foreground">
                        Rest Between Rounds (s)
                      </Label>
                      <Input
                        id="round-rest"
                        data-testid="input-round-rest"
                        type="number"
                        min="0"
                        value={currentBlock.params?.roundRestSec ?? ""}
                        onChange={(e) => setCurrentBlock({
                          ...currentBlock,
                          params: { ...currentBlock.params, roundRestSec: Number(e.target.value) }
                        })}
                        placeholder="90"
                      />
                    </div>
                  )}
                </div>
              </div>
                </>
              )}

              {/* Action Buttons */}
              <div className="flex gap-2 pt-2">
                <Button
                  onClick={addBlock}
                  className="flex-1"
                  data-testid="button-add-block"
                  disabled={!currentBlock.name && selectedPattern !== "transition"}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add Block to Workout
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setCurrentBlock({ 
                      type: "custom_sequence",
                      params: { setsPerExercise: 3, workSec: 45, restSec: 10, roundRestSec: 0 },
                      exercises: []
                    });
                    setSelectedPattern("superset");
                    setWorkType("time");
                  }}
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
                      
                      {/* Timing Summary */}
                      <div className="mt-2 space-y-1">
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          {block.params.setsPerExercise && (
                            <span className="bg-muted px-2 py-1 rounded">
                              <strong>{block.params.setsPerExercise}</strong> sets
                            </span>
                          )}
                          {block.params.workSec && (
                            <span className="bg-muted px-2 py-1 rounded">
                              <strong>{block.params.workSec}s</strong> work
                            </span>
                          )}
                          {block.params.targetReps && (
                            <span className="bg-muted px-2 py-1 rounded">
                              <strong>{block.params.targetReps}</strong> reps
                            </span>
                          )}
                          {block.params.restSec !== undefined && (
                            <span className="bg-muted px-2 py-1 rounded">
                              <strong>{block.params.restSec}s</strong> rest
                            </span>
                          )}
                          {block.params.roundRestSec && block.params.roundRestSec > 0 && (
                            <span className="bg-muted px-2 py-1 rounded">
                              <strong>{block.params.roundRestSec}s</strong> round rest
                            </span>
                          )}
                        </div>
                      </div>

                      {block.exercises.length > 0 && (
                        <div className="mt-2">
                          <p className="text-xs text-muted-foreground mb-1">Exercises:</p>
                          {block.exercises.map((ex, idx) => (
                            <span key={idx} className="text-xs bg-primary/10 px-2 py-1 rounded mr-1">
                              {getExerciseName(ex.exerciseId)}
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
      </TabsContent>

      <TabsContent value="manage" className="mt-6">
        <ManageWorkoutsTab onEditWorkout={(id) => loadWorkoutMutation.mutate(id)} />
      </TabsContent>
    </Tabs>

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
    </div>
  );
}
