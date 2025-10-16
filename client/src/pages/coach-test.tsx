import { WorkoutPlayer } from '@/player/WorkoutPlayer';

export default function CoachTest() {
  // Mock workout data for testing
  const mockWorkout = { id: 'test-workout-1' };
  
  const mockBlocks = [
    {
      id: 'block-1',
      params: {
        pattern: 'superset' as const,
        mode: 'reps' as const,
        awaitReadyBeforeStart: true
      }
    }
  ];
  
  const mockExercises = [
    { id: 'ex-1', name: 'Barbell Bench Press' },
    { id: 'ex-2', name: 'Dumbbell Row' }
  ];
  
  const mockLastLoads = {
    'ex-1': 80,
    'ex-2': 35
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <WorkoutPlayer
        workout={mockWorkout}
        blocks={mockBlocks}
        exercises={mockExercises}
        lastLoads={mockLastLoads}
      />
    </div>
  );
}
