import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Play, Clock, Target, Edit, Trash2, Dumbbell } from "lucide-react";
import type { Workout, SuperSet } from "@shared/schema";

const createWorkoutSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  estimatedDuration: z.number().min(15).max(180).optional(),
  difficulty: z.number().min(1).max(5).default(3),
  muscleGroups: z.string().optional(),
  tags: z.string().optional(),
  isTemplate: z.boolean().default(false),
  isPublic: z.boolean().default(false)
});

type CreateWorkoutForm = z.infer<typeof createWorkoutSchema>;

export default function WorkoutsPage() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  // Fetch user's workouts
  const { data: workouts, isLoading } = useQuery<Workout[]>({
    queryKey: ['/api/workouts'],
  });

  // Fetch user's super sets for workout creation
  const { data: superSets } = useQuery<SuperSet[]>({
    queryKey: ['/api/supersets'],
  });

  // Create workout mutation
  const createWorkoutMutation = useMutation({
    mutationFn: async (data: CreateWorkoutForm) => {
      const processedData = {
        ...data,
        muscleGroups: data.muscleGroups ? data.muscleGroups.split(',').map(m => m.trim()) : [],
        tags: data.tags ? data.tags.split(',').map(t => t.trim()) : []
      };
      return await apiRequest('/api/workouts', {
        method: 'POST',
        body: JSON.stringify(processedData)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workouts'] });
      setIsCreateDialogOpen(false);
      form.reset();
    }
  });

  // Delete workout mutation
  const deleteWorkoutMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest(`/api/workouts/${id}`, {
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/workouts'] });
    }
  });

  // Start workout session mutation
  const startWorkoutMutation = useMutation({
    mutationFn: async (workoutId: number) => {
      return await apiRequest('/api/workout-sessions/start', {
        method: 'POST',
        body: JSON.stringify({
          workoutId,
          enableCoaching: true,
          voiceEnabled: false,
          coachingStyle: 'motivational'
        })
      });
    },
    onSuccess: (data) => {
      // Navigate to workout session (implement route)
      console.log('Workout session started:', data);
    }
  });

  const form = useForm<CreateWorkoutForm>({
    resolver: zodResolver(createWorkoutSchema),
    defaultValues: {
      difficulty: 3,
      isTemplate: false,
      isPublic: false
    }
  });

  const onSubmit = (data: CreateWorkoutForm) => {
    createWorkoutMutation.mutate(data);
  };

  const getDifficultyLabel = (difficulty: number) => {
    const labels = ['', 'Beginner', 'Novice', 'Intermediate', 'Advanced', 'Expert'];
    return labels[difficulty] || 'Unknown';
  };

  const getDifficultyColor = (difficulty: number) => {
    const colors = ['', 'bg-green-100 text-green-800', 'bg-blue-100 text-blue-800', 
                   'bg-yellow-100 text-yellow-800', 'bg-orange-100 text-orange-800', 
                   'bg-red-100 text-red-800'];
    return colors[difficulty] || 'bg-gray-100 text-gray-800';
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Target className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p>Loading your workouts...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">My Workouts</h1>
          <p className="text-muted-foreground">Create and manage your training routines</p>
        </div>
        
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Workout
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Workout</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Workout Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Upper Body Blast" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Describe your workout routine..."
                          className="resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="estimatedDuration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Duration (minutes)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            min="15" 
                            max="180" 
                            placeholder="45"
                            {...field}
                            onChange={(e) => field.onChange(e.target.value ? Number(e.target.value) : undefined)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="difficulty"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Difficulty</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            min="1" 
                            max="5" 
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="muscleGroups"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Muscle Groups</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="chest, back, shoulders (comma separated)"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tags"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tags</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="strength, hypertrophy, compound (comma separated)"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={createWorkoutMutation.isPending}
                >
                  {createWorkoutMutation.isPending ? 'Creating...' : 'Create Workout'}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {workouts?.length === 0 ? (
        <div className="text-center py-12">
          <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No Workouts Yet</h3>
          <p className="text-muted-foreground mb-4">Create your first workout routine to get started</p>
          {superSets && superSets.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Tip: Create some super sets first to build comprehensive workouts
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {workouts?.map((workout) => (
            <Card key={workout.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{workout.name}</CardTitle>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge className={getDifficultyColor(workout.difficulty)}>
                        {getDifficultyLabel(workout.difficulty)}
                      </Badge>
                      {workout.isTemplate && (
                        <Badge variant="outline">Template</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm">
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => deleteWorkoutMutation.mutate(workout.id)}
                      disabled={deleteWorkoutMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {workout.description && (
                    <p className="text-sm text-muted-foreground">
                      {workout.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {workout.estimatedDuration && (
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {workout.estimatedDuration} min
                      </div>
                    )}
                    <div className="flex items-center gap-1">
                      <Dumbbell className="h-3 w-3" />
                      Multi-set
                    </div>
                  </div>

                  {workout.muscleGroups && workout.muscleGroups.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        MUSCLE GROUPS
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {workout.muscleGroups.map((group) => (
                          <Badge key={group} variant="secondary" className="text-xs">
                            {group}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {workout.tags && workout.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {workout.tags.map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}

                  <Button 
                    className="w-full mt-4" 
                    onClick={() => startWorkoutMutation.mutate(workout.id)}
                    disabled={startWorkoutMutation.isPending}
                  >
                    <Play className="h-4 w-4 mr-2" />
                    {startWorkoutMutation.isPending ? 'Starting...' : 'Start Workout'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}