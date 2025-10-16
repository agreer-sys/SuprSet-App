import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onEvent } from '@/coach/observer';
import { seedResponses } from '@/coach/responseService';
import { PreflightWeightsSheet } from '@/components/PreflightWeightsSheet';
import type { TimelineContext, ChatterLevel, Event } from '@/types/coach';
import { TimelinePlayer } from '@/runtime/TimelinePlayer';

interface WorkoutPlayerProps {
  workout: {
    id: number;
    name: string;
    executionTimeline?: any; // Compiled timeline from server
  };
}

export function WorkoutPlayer({ workout }: WorkoutPlayerProps) {
  const [planned, setPlanned] = useState<Record<string, number|undefined>>({});
  const [stage, setStage] = useState<'loading'|'preflight'|'playing'>('loading');
  const chatterLevel: ChatterLevel = 'minimal';

  // Extract exercises from the compiled timeline
  const exercises = useMemo(() => {
    if (!workout.executionTimeline) return [];
    const exerciseMap = new Map();
    workout.executionTimeline.executionTimeline.forEach((step: any) => {
      if (step.exercise) {
        exerciseMap.set(step.exercise.id.toString(), {
          id: step.exercise.id.toString(),
          name: step.exercise.name
        });
      }
    });
    return Array.from(exerciseMap.values());
  }, [workout.executionTimeline]);

  // Determine pattern and mode from the compiled timeline
  const pattern = 'superset'; // Default, could extract from workout metadata
  const mode = 'reps' as const; // Default, could extract from workout metadata

  // Build a TimelineContext the observer can use
  const ctx = useMemo<TimelineContext>(() => ({
    workoutId: workout.id.toString(),
    pattern,
    mode,
    chatterLevel,
    prefs: { preflightLoadIntake: true, strictEMOM: true, allowAutoExtendRest: false, rpeLabels: 'words' },
    plannedLoads: planned,
    nowMs: () => Date.now(),
    getExerciseName: (id) => exercises.find(e => e.id === id)?.name || 'Exercise',
    getNextExerciseName: () => undefined,
    // Minimal UI hooks
    showReadyModal: () => new Promise<void>(res => { if (window.confirm('Ready?')) res(); }),
    speak: (t) => console.log('[COACH]', t),
    caption: (t) => console.log('[CAPTION]', t),
    haptic: () => {}
  }), [workout.id, pattern, mode, planned, exercises, chatterLevel]);

  // Seed response lines
  useEffect(() => {
    seedResponses([
      { id:1,event_type:'pre_block',pattern:'any',mode:'any',chatter_level:'minimal',locale:'en-US',text_template:'Block starting — set up now.',priority:4,cooldown_sec:10,active:true,usage_count:0,last_used_at:null },
      { id:2,event_type:'rest_start',pattern:'any',mode:'reps',chatter_level:'minimal',locale:'en-US',text_template:'Rest — log reps & load; tap "Use last values" if unchanged.',priority:5,cooldown_sec:10,active:true,usage_count:0,last_used_at:null },
      { id:3,event_type:'workout_end',pattern:'any',mode:'any',chatter_level:'minimal',locale:'en-US',text_template:'Workout complete — great job today!',priority:10,cooldown_sec:0,active:true,usage_count:0,last_used_at:null }
    ] as any);
  }, []);

  // Check if workout has a compiled timeline
  useEffect(() => {
    if (workout.executionTimeline) {
      setStage('preflight');
    }
  }, [workout.executionTimeline]);

  // Wire the real timeline player → observer
  const playerRef = useRef<TimelinePlayer | null>(null);
  useEffect(() => {
    if (stage !== 'playing' || !workout.executionTimeline) return;
    
    const player = new TimelinePlayer();
    playerRef.current = player;
    const unsub = player.subscribe((ev: Event) => onEvent(ctx, ev));
    
    console.log('🎬 Starting compiled timeline:', workout.executionTimeline);
    player.start(workout.executionTimeline);
    
    return () => {
      player.stop();
      unsub();
    };
  }, [stage, ctx, workout.executionTimeline]);

  if (stage === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-lg">Loading workout timeline...</div>
      </div>
    );
  }

  if (stage === 'preflight') {
    return (
      <PreflightWeightsSheet
        exercises={exercises}
        lastLoads={{}} // No previous loads for testing
        onSave={(p) => { setPlanned(p); setStage('playing'); }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center">
        <div className="text-2xl font-bold mb-2">▶️ {workout.name}</div>
        <div className="text-lg text-muted-foreground">Workout running… (see console for Coach output)</div>
      </div>
    </div>
  );
}
