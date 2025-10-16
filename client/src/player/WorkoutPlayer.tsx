import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onEvent } from '@/coach/observer';
import { seedResponses } from '@/coach/responseService';
import { PreflightWeightsSheet } from '@/components/PreflightWeightsSheet';
import type { TimelineContext, ChatterLevel, Event } from '@/types/coach';
import { ExecutionTimeline } from '@/runtime/executionTimeline';

export function WorkoutPlayer({ workout, blocks, exercises, lastLoads }:{
  workout: { id: string };
  blocks: Array<{ id: string; params: { pattern:'superset'|'straight_sets'|'circuit'|'custom'; mode:'time'|'reps'; awaitReadyBeforeStart?: boolean } }>;
  exercises: Array<{ id: string; name: string }>;
  lastLoads: Record<string, number|undefined>;
}) {
  const [planned, setPlanned] = useState<Record<string, number|undefined>>({});
  const [stage, setStage] = useState<'preflight'|'playing'>('preflight');
  const chatterLevel: ChatterLevel = 'minimal';

  // Build a TimelineContext the observer can use
  const ctx = useMemo<TimelineContext>(() => ({
    workoutId: workout.id,
    pattern: blocks[0]?.params.pattern ?? 'straight_sets',
    mode: blocks[0]?.params.mode ?? 'reps',
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
  }), [workout.id, blocks, planned, exercises, chatterLevel]);

  // (Optional) seed a couple response lines (Tier‑2) so you see variety immediately
  useEffect(() => {
    seedResponses([
      { id:1,event_type:'pre_block',pattern:'any',mode:'any',chatter_level:'minimal',locale:'en-US',text_template:'Block starting — set up now.',priority:4,cooldown_sec:10,active:true,usage_count:0,last_used_at:null },
      { id:2,event_type:'rest_start',pattern:'any',mode:'reps',chatter_level:'minimal',locale:'en-US',text_template:'Rest — log reps & load; tap "Use last values" if unchanged.',priority:5,cooldown_sec:10,active:true,usage_count:0,last_used_at:null },
      { id:3,event_type:'workout_end',pattern:'any',mode:'any',chatter_level:'minimal',locale:'en-US',text_template:'Workout complete — great job today!',priority:10,cooldown_sec:0,active:true,usage_count:0,last_used_at:null }
    ] as any);
  }, []);

  // Wire the timeline emitter → observer
  const tlRef = useRef<ExecutionTimeline | null>(null);
  useEffect(() => {
    if (stage !== 'playing') return;
    const tl = new ExecutionTimeline();
    tlRef.current = tl;
    const unsub = tl.subscribe((ev: Event) => onEvent(ctx, ev));
    tl.start(blocks, { strictEMOM: true });
    return unsub;
  }, [stage, ctx, blocks]);

  if (stage === 'preflight') {
    return (
      <PreflightWeightsSheet
        exercises={exercises}
        lastLoads={lastLoads}
        onSave={(p) => { setPlanned(p); setStage('playing'); }}
      />
    );
  }
  return <div>▶️ Workout running… (see console for Coach output)</div>;
}
