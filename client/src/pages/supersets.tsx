import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Dumbbell, Clock, Users, Edit, Trash2 } from "lucide-react";
import type { SuperSet, Exercise } from "@shared/schema";

const createSuperSetSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  exerciseAId: z.number({ required_error: "First exercise is required" }),
  exerciseBId: z.number({ required_error: "Second exercise is required" }),
  defaultSets: z.number().min(1).max(10).default(3),
  defaultRestTime: z.number().min(30).max(300).default(150),
  difficulty: z.number().min(1).max(5).default(3),
  tags: z.string().optional(),
  isPublic: z.boolean().default(false)
});

type CreateSuperSetForm = z.infer<typeof createSuperSetSchema>;

export default function SuperSetsPage() {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  // Fetch user's super sets
  const { data: superSets, isLoading } = useQuery<SuperSet[]>({
    queryKey: ['/api/supersets'],
  });

  // Fetch exercises for selection
  const { data: exercises } = useQuery<Exercise[]>({
    queryKey: ['/api/exercises'],
  });

  // Create super set mutation
  const createSuperSetMutation = useMutation({
    mutationFn: async (data: CreateSuperSetForm) => {
      const processedData = {
        ...data,
        tags: data.tags ? data.tags.split(',').map(t => t.trim()) : []
      };
      return await apiRequest('/api/supersets', {
        method: 'POST',
        body: JSON.stringify(processedData)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/supersets'] });
      setIsCreateDialogOpen(false);
      form.reset();
    }
  });

  // Delete super set mutation
  const deleteSuperSetMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest(`/api/supersets/${id}`, {
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/supersets'] });
    }
  });

  const form = useForm<CreateSuperSetForm>({
    resolver: zodResolver(createSuperSetSchema),
    defaultValues: {
      defaultSets: 3,
      defaultRestTime: 150,
      difficulty: 3,
      isPublic: false
    }
  });

  const onSubmit = (data: CreateSuperSetForm) => {
    createSuperSetMutation.mutate(data);
  };

  const getExerciseName = (exerciseId: number) => {
    return exercises?.find(e => e.id === exerciseId)?.name || 'Unknown Exercise';
  };

  const getDifficultyLabel = (difficulty: number) => {
    const labels = ['', 'Beginner', 'Novice', 'Intermediate', 'Advanced', 'Expert'];
    return labels[difficulty] || 'Unknown';
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <Dumbbell className="h-8 w-8 animate-spin mx-auto mb-4" />
            <p>Loading your super sets...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">My Super Sets</h1>
          <p className="text-muted-foreground">Manage your custom exercise combinations</p>
        </div>
        
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Create Super Set
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Super Set</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Push-Pull Combo" {...field} />
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
                          placeholder="Describe your super set..."
                          className="resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="exerciseAId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Exercise</FormLabel>
                      <Select onValueChange={(value) => field.onChange(Number(value))}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select first exercise" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {exercises?.map((exercise) => (
                            <SelectItem key={exercise.id} value={exercise.id.toString()}>
                              {exercise.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="exerciseBId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Second Exercise</FormLabel>
                      <Select onValueChange={(value) => field.onChange(Number(value))}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select second exercise" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {exercises?.map((exercise) => (
                            <SelectItem key={exercise.id} value={exercise.id.toString()}>
                              {exercise.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="defaultSets"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sets</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            min="1" 
                            max="10" 
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="defaultRestTime"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Rest (seconds)</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            min="30" 
                            max="300" 
                            step="15"
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
                  name="difficulty"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Difficulty Level</FormLabel>
                      <Select onValueChange={(value) => field.onChange(Number(value))}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select difficulty" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="1">1 - Beginner</SelectItem>
                          <SelectItem value="2">2 - Novice</SelectItem>
                          <SelectItem value="3">3 - Intermediate</SelectItem>
                          <SelectItem value="4">4 - Advanced</SelectItem>
                          <SelectItem value="5">5 - Expert</SelectItem>
                        </SelectContent>
                      </Select>
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
                          placeholder="push, pull, chest, back (comma separated)"
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
                  disabled={createSuperSetMutation.isPending}
                >
                  {createSuperSetMutation.isPending ? 'Creating...' : 'Create Super Set'}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {superSets?.length === 0 ? (
        <div className="text-center py-12">
          <Dumbbell className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No Super Sets Yet</h3>
          <p className="text-muted-foreground">Create your first super set to get started</p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {superSets?.map((superSet) => (
            <Card key={superSet.id} className="relative">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{superSet.name}</CardTitle>
                    <Badge variant="outline" className="mt-1">
                      {getDifficultyLabel(superSet.difficulty)}
                    </Badge>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm">
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => deleteSuperSetMutation.mutate(superSet.id)}
                      disabled={deleteSuperSetMutation.isPending}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium">Exercise A:</p>
                    <p className="text-sm text-muted-foreground">
                      {getExerciseName(superSet.exerciseAId)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium">Exercise B:</p>
                    <p className="text-sm text-muted-foreground">
                      {getExerciseName(superSet.exerciseBId)}
                    </p>
                  </div>
                  
                  {superSet.description && (
                    <p className="text-sm text-muted-foreground">
                      {superSet.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {superSet.defaultSets} sets
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {Math.round(superSet.defaultRestTime / 60)}m rest
                    </div>
                  </div>

                  {superSet.tags && superSet.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {superSet.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}