import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { Clock, Target, Zap, User, Play, Calendar, Users, Brain, Volume2, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Link, useLocation } from 'wouter';

interface WorkoutTemplate {
  id: number;
  name: string;
  description: string;
  workoutType: string;
  category: string;
  difficulty: number;
  estimatedDuration: number;
  timingStructure: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

interface WorkoutSection {
  id: number;
  name: string;
  sectionType: string;
  orderIndex: number;
  duration?: number;
  instructions?: string;
  exercises: Array<{
    id: number;
    exerciseId: number;
    orderIndex: number;
    sets?: number;
    reps?: string;
    duration?: number;
    notes?: string;
    exercise: {
      id: number;
      name: string;
      category: string;
      difficulty: number;
    };
  }>;
}

interface DetailedWorkoutTemplate extends WorkoutTemplate {
  sections: WorkoutSection[];
}

const difficultyColors = {
  1: 'bg-green-100 text-green-800',
  2: 'bg-blue-100 text-blue-800', 
  3: 'bg-yellow-100 text-yellow-800',
  4: 'bg-orange-100 text-orange-800',
  5: 'bg-red-100 text-red-800',
};

const workoutTypeColors = {
  strength: 'bg-blue-500',
  crossfit: 'bg-red-500',
  cardio: 'bg-green-500',
  flexibility: 'bg-purple-500',
};

export default function PreBuiltWorkouts() {
  const [, setLocation] = useLocation();
  const [selectedTemplate, setSelectedTemplate] = useState<DetailedWorkoutTemplate | null>(null);
  const [filters, setFilters] = useState({
    workoutType: '',
    category: '',
    difficulty: '',
  });
  const [coachingOptions, setCoachingOptions] = useState({
    enableCoaching: true,
    voiceEnabled: true,
    coachingStyle: 'motivational' as 'motivational' | 'technical' | 'casual'
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch workout templates (old system)
  const { data: templatesResponse, isLoading: isLoadingTemplates } = useQuery({
    queryKey: ['/api/workout-templates', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.workoutType) params.append('workoutType', filters.workoutType);
      if (filters.category) params.append('category', filters.category);
      if (filters.difficulty) params.append('difficulty', filters.difficulty);
      
      const url = `/api/workout-templates${params.toString() ? '?' + params.toString() : ''}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch templates');
      return response.json();
    },
  });

  // Fetch block workouts (new system)
  const { data: blockWorkoutsResponse, isLoading: isLoadingBlockWorkouts } = useQuery({
    queryKey: ['/api/block-workouts'],
    queryFn: async () => {
      const response = await fetch('/api/block-workouts');
      if (!response.ok) throw new Error('Failed to fetch block workouts');
      return response.json();
    },
  });

  // Ensure templates is always an array
  const templates = Array.isArray(templatesResponse) ? templatesResponse : [];
  const blockWorkouts = Array.isArray(blockWorkoutsResponse) ? blockWorkoutsResponse : [];
  const isLoading = isLoadingTemplates || isLoadingBlockWorkouts;

  // Fetch detailed template when selected
  const { data: detailedTemplate, isLoading: isLoadingDetails } = useQuery<DetailedWorkoutTemplate>({
    queryKey: ['/api/workout-templates', selectedTemplate?.id],
    queryFn: () => fetch(`/api/workout-templates/${selectedTemplate?.id}`).then(r => r.json()),
    enabled: !!selectedTemplate?.id,
  });

  // Start workout session mutation
  const startWorkoutMutation = useMutation({
    mutationFn: async (templateId: number) => {
      const response = await fetch('/api/workout-sessions/from-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          templateId, 
          userId: 'user123', // TODO: Get from auth context
          enableCoaching: coachingOptions.enableCoaching,
          voiceEnabled: coachingOptions.voiceEnabled,
          coachingStyle: coachingOptions.coachingStyle
        }),
      });
      if (!response.ok) throw new Error('Failed to start workout');
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Workout Started!',
        description: `Workout started successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/workout-sessions'] });
      setLocation('/workout-session'); // Navigate to workout session page
    },
    onError: (error: any) => {
      toast({
        title: 'Error Starting Workout',
        description: error.message || 'Failed to start workout session.',
        variant: 'destructive',
      });
    },
  });

  const handleStartWorkout = (templateId: number) => {
    startWorkoutMutation.mutate(templateId);
  };

  const getDifficultyLabel = (difficulty: number) => {
    const labels = { 1: 'Beginner', 2: 'Easy', 3: 'Intermediate', 4: 'Advanced', 5: 'Expert' };
    return labels[difficulty as keyof typeof labels] || 'Unknown';
  };

  const formatDuration = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-full" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8" data-testid="pre-built-workouts-page">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2" data-testid="page-title">
          Pre-Built Workouts
        </h1>
        <p className="text-gray-600" data-testid="page-description">
          Choose from professionally designed workout templates and start training with AI coaching
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap gap-4" data-testid="workout-filters">
        <select 
          value={filters.workoutType} 
          onChange={(e) => setFilters(prev => ({ ...prev, workoutType: e.target.value }))}
          className="px-3 py-2 border border-gray-300 rounded-md"
          data-testid="filter-workout-type"
        >
          <option value="">All Types</option>
          <option value="strength">Strength Training</option>
          <option value="crossfit">CrossFit</option>
          <option value="cardio">Cardio</option>
          <option value="flexibility">Flexibility</option>
        </select>

        <select 
          value={filters.category} 
          onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value }))}
          className="px-3 py-2 border border-gray-300 rounded-md"
          data-testid="filter-category"
        >
          <option value="">All Categories</option>
          <option value="Upper Body">Upper Body</option>
          <option value="Lower Body">Lower Body</option>
          <option value="Full Body">Full Body</option>
          <option value="Core">Core</option>
        </select>

        <select 
          value={filters.difficulty} 
          onChange={(e) => setFilters(prev => ({ ...prev, difficulty: e.target.value }))}
          className="px-3 py-2 border border-gray-300 rounded-md"
          data-testid="filter-difficulty"
        >
          <option value="">All Difficulties</option>
          <option value="1">Beginner</option>
          <option value="2">Easy</option>
          <option value="3">Intermediate</option>
          <option value="4">Advanced</option>
          <option value="5">Expert</option>
        </select>
      </div>

      {/* Block Workouts Section (New System) */}
      {blockWorkouts.length > 0 && (
        <>
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Block Workouts</h2>
            <p className="text-gray-600">New workout system with customizable blocks</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12" data-testid="block-workouts-grid">
            {blockWorkouts.map((workout: any) => (
              <Card key={workout.id} className="hover:shadow-lg transition-shadow" data-testid={`block-workout-${workout.id}`}>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Badge className="bg-purple-500 text-white">
                          Block Workout
                        </Badge>
                      </div>
                      <CardTitle className="text-lg mb-2" data-testid={`block-workout-name-${workout.id}`}>
                        {workout.name}
                      </CardTitle>
                      {workout.description && (
                        <CardDescription data-testid={`block-workout-description-${workout.id}`}>
                          {workout.description}
                        </CardDescription>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <div className="flex items-center gap-1">
                        <Clock className="h-4 w-4" />
                        <span data-testid={`block-workout-duration-${workout.id}`}>
                          {workout.estimatedDurationMin}min
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Target className="h-4 w-4" />
                        <span>{workout.blockSequence?.length || 0} blocks</span>
                      </div>
                    </div>

                    <Link href={`/workout-session?blockWorkoutId=${workout.id}`}>
                      <Button 
                        size="sm" 
                        className="w-full"
                        data-testid={`start-block-workout-${workout.id}`}
                      >
                        <Play className="h-4 w-4 mr-1" />
                        Start Workout
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Workout Templates Grid (Old System) */}
      {templates.length > 0 && (
        <>
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Classic Templates</h2>
            <p className="text-gray-600">Legacy workout templates</p>
          </div>
        </>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="workout-templates-grid">
        {templates.map((template: WorkoutTemplate) => (
          <Card key={template.id} className="hover:shadow-lg transition-shadow cursor-pointer" data-testid={`workout-template-${template.id}`}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <CardTitle className="text-lg mb-2" data-testid={`template-name-${template.id}`}>
                    {template.name}
                  </CardTitle>
                  <CardDescription data-testid={`template-description-${template.id}`}>
                    {template.description}
                  </CardDescription>
                </div>
                <div className="flex flex-col gap-2 ml-4">
                  <Badge 
                    className={`${workoutTypeColors[template.workoutType as keyof typeof workoutTypeColors] || 'bg-gray-500'} text-white`}
                    data-testid={`template-type-${template.id}`}
                  >
                    {template.workoutType}
                  </Badge>
                  <Badge 
                    className={difficultyColors[template.difficulty as keyof typeof difficultyColors] || 'bg-gray-100 text-gray-800'}
                    data-testid={`template-difficulty-${template.id}`}
                  >
                    {getDifficultyLabel(template.difficulty)}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    <span data-testid={`template-duration-${template.id}`}>
                      {formatDuration(template.estimatedDuration)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Target className="h-4 w-4" />
                    <span data-testid={`template-category-${template.id}`}>
                      {template.category}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Zap className="h-4 w-4" />
                    <span data-testid={`template-timing-${template.id}`}>
                      {template.timingStructure}
                    </span>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="flex-1"
                    onClick={() => setSelectedTemplate(template as any)}
                    data-testid={`view-details-${template.id}`}
                  >
                    View Details
                  </Button>
                  <Button 
                    size="sm" 
                    className="flex-1"
                    onClick={() => handleStartWorkout(template.id)}
                    disabled={startWorkoutMutation.isPending}
                    data-testid={`start-workout-${template.id}`}
                  >
                    <Play className="h-4 w-4 mr-1" />
                    {startWorkoutMutation.isPending ? 'Starting...' : 'Start'}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Empty State */}
      {templates.length === 0 && blockWorkouts.length === 0 && (
        <div className="text-center py-12" data-testid="empty-state">
          <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No workouts found</h3>
          <p className="text-gray-600">No workouts available yet. Check back soon or create one in the admin panel.</p>
        </div>
      )}

      {/* Template Details Modal - TODO: Convert to proper modal */}
      {selectedTemplate && detailedTemplate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" data-testid="template-details-modal">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-2xl font-bold" data-testid="modal-template-name">
                  {detailedTemplate.name}
                </h2>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setSelectedTemplate(null)}
                  data-testid="close-modal"
                >
                  ✕
                </Button>
              </div>
              
              <p className="text-gray-600 mb-6" data-testid="modal-template-description">
                {detailedTemplate.description}
              </p>

              <div className="space-y-6" data-testid="template-sections">
                {detailedTemplate.sections.map((section) => (
                  <div key={section.id} className="border rounded-lg p-4" data-testid={`section-${section.id}`}>
                    <h3 className="font-semibold text-lg mb-2" data-testid={`section-name-${section.id}`}>
                      {section.name}
                    </h3>
                    {section.instructions && (
                      <p className="text-sm text-gray-600 mb-3" data-testid={`section-instructions-${section.id}`}>
                        {section.instructions}
                      </p>
                    )}
                    <div className="space-y-2">
                      {section.exercises.map((exercise) => (
                        <div key={exercise.id} className="flex justify-between items-center p-2 bg-gray-50 rounded" data-testid={`exercise-${exercise.id}`}>
                          <span className="font-medium" data-testid={`exercise-name-${exercise.id}`}>
                            {exercise.exercise.name}
                          </span>
                          <span className="text-sm text-gray-600" data-testid={`exercise-details-${exercise.id}`}>
                            {exercise.sets && `${exercise.sets} sets`}
                            {exercise.reps && ` × ${exercise.reps}`}
                            {exercise.duration && ` ${Math.floor(exercise.duration / 60)}min`}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {/* AI Coaching Options */}
              <div className="border-t pt-6 mt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Brain className="h-5 w-5" />
                  <h3 className="font-semibold">AI Coach Options</h3>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="enable-coaching" className="flex items-center gap-2">
                      <Brain className="h-4 w-4" />
                      Enable AI Coach
                    </Label>
                    <Switch
                      id="enable-coaching"
                      checked={coachingOptions.enableCoaching}
                      onCheckedChange={(checked) => 
                        setCoachingOptions(prev => ({ ...prev, enableCoaching: checked }))
                      }
                      data-testid="coaching-enable-switch"
                    />
                  </div>
                  
                  {coachingOptions.enableCoaching && (
                    <>
                      <div className="flex items-center justify-between">
                        <Label htmlFor="voice-enabled" className="flex items-center gap-2">
                          <Volume2 className="h-4 w-4" />
                          Voice Coaching
                        </Label>
                        <Switch
                          id="voice-enabled"
                          checked={coachingOptions.voiceEnabled}
                          onCheckedChange={(checked) => 
                            setCoachingOptions(prev => ({ ...prev, voiceEnabled: checked }))
                          }
                          data-testid="coaching-voice-switch"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="coaching-style">Coaching Style</Label>
                        <Select
                          value={coachingOptions.coachingStyle}
                          onValueChange={(value) => 
                            setCoachingOptions(prev => ({ ...prev, coachingStyle: value as 'motivational' | 'technical' | 'casual' }))
                          }
                        >
                          <SelectTrigger data-testid="coaching-style-select">
                            <SelectValue placeholder="Select coaching style" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="motivational">Motivational - Energetic & encouraging</SelectItem>
                            <SelectItem value="technical">Technical - Form & technique focused</SelectItem>
                            <SelectItem value="casual">Casual - Friendly & conversational</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <Button 
                  className="flex-1"
                  onClick={() => handleStartWorkout(detailedTemplate.id)}
                  disabled={startWorkoutMutation.isPending}
                  data-testid="modal-start-workout"
                >
                  <Play className="h-4 w-4 mr-2" />
                  {startWorkoutMutation.isPending ? 'Starting Workout...' : 'Start This Workout'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}