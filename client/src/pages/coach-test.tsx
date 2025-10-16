import { WorkoutPlayer } from '@/player/WorkoutPlayer';
import { useQuery } from '@tanstack/react-query';

export default function CoachTest() {
  // Fetch a real block workout from the server
  const { data: workouts, isLoading } = useQuery<Array<{
    id: number;
    name: string;
    executionTimeline?: any;
  }>>({
    queryKey: ['/api/block-workouts'],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-lg">Loading workouts...</div>
      </div>
    );
  }

  if (!workouts || workouts.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-lg">No workouts found. Create one in the admin panel first.</div>
      </div>
    );
  }

  // Use the first available workout
  const workout = workouts[0];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <WorkoutPlayer
        workout={workout}
      />
    </div>
  );
}
