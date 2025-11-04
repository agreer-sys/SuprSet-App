import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onEvent } from '@/coach/observer';
import { seedResponses } from '@/coach/responseService';
import { PreflightWeightsSheet } from '@/components/PreflightWeightsSheet';
import { WorkoutIntroSheet } from '@/components/WorkoutIntroSheet';
import type { ChatterLevel as IntroChatterLevel } from '@/components/WorkoutIntroSheet';
import type { TimelineContext, ChatterLevel, Event } from '@/types/coach';
import { TimelinePlayer } from '@/runtime/TimelinePlayer';
import { speakTTS } from '@/audio/ttsAdapter';
import { beeps } from '@/coach/beeps';
import { voiceBus } from '@/audio/voiceBus';
import { scheduleRepRound, formatRoundLabel } from '@/coach/coachRoundScheduler';

interface WorkoutPlayerProps {
  workout: {
    id: number;
    name: string;
    executionTimeline?: any; // Compiled timeline from server
  };
}

export function WorkoutPlayer({ workout }: WorkoutPlayerProps) {
  const [planned, setPlanned] = useState<Record<string, number|undefined>>({});
  const [stage, setStage] = useState<'loading'|'intro'|'preflight'|'playing'>('loading');
  const [audioReady, setAudioReady] = useState(false);
  const [chatterLevel, setChatterLevel] = useState<ChatterLevel>('minimal');
  const [repPaceSec, setRepPaceSec] = useState<number>(180);

  // Initialize AudioContext on first user gesture (iOS requirement)
  useEffect(() => {
    if (audioReady) return;
    
    const initAudio = () => {
      voiceBus.ensure(); // Initialize AudioContext
      beeps.ensureCtx(); // Initialize beep AudioContext
      setAudioReady(true);
      console.log('🎧 Audio system initialized');
      
      // Remove listeners after first gesture
      document.removeEventListener('pointerdown', initAudio);
      document.removeEventListener('touchstart', initAudio);
    };
    
    document.addEventListener('pointerdown', initAudio, { once: true });
    document.addEventListener('touchstart', initAudio, { once: true });
    
    return () => {
      document.removeEventListener('pointerdown', initAudio);
      document.removeEventListener('touchstart', initAudio);
    };
  }, [audioReady]);

  // Extract exercises from the compiled timeline
  const exercises = useMemo(() => {
    if (!workout.executionTimeline) return [];
    const exerciseMap = new Map();
    workout.executionTimeline.executionTimeline.forEach((step: any) => {
      if (step.exercise) {
        exerciseMap.set(step.exercise.id.toString(), {
          id: step.exercise.id.toString(),
          name: step.exercise.name,
          cues: step.exercise.cues || [],
          equipment: step.exercise.equipment || [],
          muscleGroup: step.exercise.muscleGroup || '',
          videoUrl: step.exercise.videoUrl,
          imageUrl: step.exercise.imageUrl,
          estimatedTimeSec: step.exercise.estimatedTimeSec || 45
        });
      }
    });
    return Array.from(exerciseMap.values());
  }, [workout.executionTimeline]);

  // Extract block metadata from the compiled timeline
  const firstBlock = workout.executionTimeline?.params;
  const exerciseCount = exercises.length;
  const pattern = firstBlock?.pattern ?? 'superset';
  const mode = firstBlock?.mode ?? 'reps' as const;

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
    getExerciseMeta: (id) => {
      const e = exercises.find(x => x.id === id) as any;
      return e
        ? { id: e.id, name: e.name, cues: e.cues||[], equipment: e.equipment||[], muscleGroup: e.muscleGroup||'', estimatedTimeSec: e.estimatedTimeSec }
        : { id, name: 'Exercise', cues: [], equipment: [], muscleGroup: '', estimatedTimeSec: 45 };
    },
    
    // NEW: personalization + block summary for intros
    user: { firstName: 'Alastair' }, // TODO: Replace with real user profile
    blockMeta: {
      pattern: firstBlock?.pattern,
      mode: firstBlock?.mode,
      durationSec: firstBlock?.durationSec,
      workSec: firstBlock?.workSec,
      restSec: firstBlock?.restSec,
      roundRestSec: firstBlock?.roundRestSec,
      rounds: firstBlock?.rounds,
      setsPerExercise: firstBlock?.setsPerExercise,
      exerciseCount,
      patternLabel: undefined,   // optional override
      guideRoundSec: 180,        // if using 3:00 rep-round guidance
    },
    
    // Minimal UI hooks
    showReadyModal: () => new Promise<void>(res => { if (window.confirm('Ready?')) res(); }),
    speak: (t) => speakTTS(t),
    beep: (k) => beeps.play(k),
    caption: (t) => console.log('[CAPTION]', t),
    haptic: () => {}
  }), [workout.id, pattern, mode, planned, exercises, chatterLevel, exerciseCount, firstBlock]);

  // Seed response lines
  useEffect(() => {
    seedResponses([
      { id:1,event_type:'pre_block',pattern:'any',mode:'any',chatter_level:'minimal',locale:'en-US',text_template:'Block starting — set up now.',priority:4,cooldown_sec:10,active:true,usage_count:0,last_used_at:null },
      { id:2,event_type:'rest_start',pattern:'any',mode:'reps',chatter_level:'minimal',locale:'en-US',text_template:'Rest — log reps & load; tap "Use last values" if unchanged.',priority:5,cooldown_sec:10,active:true,usage_count:0,last_used_at:null },
      { id:3,event_type:'workout_end',pattern:'any',mode:'any',chatter_level:'minimal',locale:'en-US',text_template:'Workout complete — great job today!',priority:10,cooldown_sec:0,active:true,usage_count:0,last_used_at:null }
    ] as any);
  }, []);

  // Check if workout has a compiled timeline - show intro first
  useEffect(() => {
    if (workout.executionTimeline) {
      setStage('intro');
    }
  }, [workout.executionTimeline]);

  // Wire the real timeline player → observer + beeps
  const playerRef = useRef<TimelinePlayer | null>(null);
  const roundCancelsRef = useRef<Array<() => void>>([]);
  
  useEffect(() => {
    if (stage !== 'playing' || !workout.executionTimeline) return;
    
    const isRepRound = mode === 'reps';
    
    // ===== REP-ROUND MODE: Use canonical round scheduler =====
    if (isRepRound) {
      console.log('🏋️ Starting rep-round workout with canonical scheduler');
      
      // Extract work steps from timeline (each represents a round)
      const workSteps = workout.executionTimeline.executionTimeline.filter(
        (step: any) => step.type === 'work'
      );
      
      const totalRounds = workSteps.length;
      console.log(`📊 ${totalRounds} rounds detected`);
      
      // Helper to get exercise cue
      const getCue = (exerciseId: string): string | null => {
        const meta = ctx.getExerciseMeta?.(exerciseId);
        return meta?.cues?.[0] || null;
      };
      
      // Schedule each round
      workSteps.forEach((workStep: any, roundIndex: number) => {
        // Extract exercises from work step
        const roundExercises = workStep.exercises || (workStep.exercise ? [workStep.exercise] : []);
        const exerciseList = roundExercises.map((ex: any) => ({
          id: ex.id.toString(),
          name: ex.name || ctx.getExerciseName(ex.id.toString())
        }));
        
        // Calculate round duration from step timing
        const roundSec = Math.floor((workStep.endMs - workStep.atMs) / 1000);
        
        // Find the rest step after this work step to get roundRestSec
        const allSteps = workout.executionTimeline.executionTimeline;
        const workStepIndex = allSteps.indexOf(workStep);
        const restStep = allSteps.slice(workStepIndex + 1).find((s: any) => s.type === 'rest');
        const roundRestSec = restStep ? Math.floor((restStep.endMs - restStep.atMs) / 1000) : 90;
        
        // Schedule this round (delayed to start at correct time)
        const roundStartDelay = workStep.atMs - 3000; // Subtract 3s for pre-round countdown
        
        const timeoutId = window.setTimeout(() => {
          console.log(`🔔 ${formatRoundLabel(roundIndex + 1, totalRounds)} starting (${roundSec}s work, ${roundRestSec}s rest)`);
          
          const cancelRound = scheduleRepRound({
            ctx,
            roundIndex,
            roundSec,
            roundRestSec,
            exercises: exerciseList,
            totalRounds,
            emit: (ev: Event) => onEvent(ctx, ev),
            getCue,
            debug: (msg) => console.log(`[Round ${roundIndex + 1}]`, msg)
          });
          
          roundCancelsRef.current.push(cancelRound);
        }, Math.max(0, roundStartDelay));
        
        roundCancelsRef.current.push(() => clearTimeout(timeoutId));
      });
      
      return () => {
        console.log('🛑 Stopping rep-round workout');
        roundCancelsRef.current.forEach(cancel => cancel());
        roundCancelsRef.current = [];
      };
    }
    
    // ===== TIME-BASED MODE: Use legacy timeline player =====
    console.log('⏱️ Starting time-based workout with timeline player');
    const player = new TimelinePlayer();
    playerRef.current = player;
    
    // Subscribe to events for voice/coaching
    const unsub = player.subscribe((ev: Event) => onEvent(ctx, ev));
    
    // Subscribe to events for beeps
    const unsubBeeps = player.subscribe((ev: Event) => {
      switch (ev.type) {
        case 'EV_COUNTDOWN':
          // Differentiate between short countdown pips (220ms) and GO beep (600ms)
          if (ev.sec && ev.sec >= 0.5) {
            // GO beep (long beep at start of work)
            ctx.beep?.('start');
          } else {
            // Countdown pips (3-2-1, short pips)
            ctx.beep?.('countdown');
          }
          break;
        case 'EV_WORK_END':
          // End beep at work completion
          ctx.beep?.('end');
          break;
      }
    });
    
    console.log('🎬 Starting compiled timeline:', workout.executionTimeline);
    player.start(workout.executionTimeline);
    
    return () => {
      player.stop();
      unsub();
      unsubBeeps();
    };
  }, [stage, ctx, workout.executionTimeline, mode]);

  if (stage === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-lg">Loading workout timeline...</div>
      </div>
    );
  }

  if (stage === 'intro') {
    // Build blocks array from workout data
    const blocks = workout.executionTimeline ? [{
      id: 'block-1',
      name: firstBlock?.name || 'Block 1',
      params: {
        pattern: firstBlock?.pattern || 'superset',
        mode: firstBlock?.mode || 'reps',
        setsPerExercise: firstBlock?.setsPerExercise || firstBlock?.rounds || 3,
        workSec: firstBlock?.workSec,
        restSec: firstBlock?.restSec,
        roundRestSec: firstBlock?.roundRestSec,
        durationSec: firstBlock?.durationSec,
        targetReps: firstBlock?.targetReps || '8-12',
        awaitReadyBeforeStart: firstBlock?.awaitReadyBeforeStart || false
      },
      exerciseIds: exercises.map(e => e.id)
    }] : [];

    return (
      <WorkoutIntroSheet
        workoutTitle={workout.name}
        blocks={blocks}
        exercises={exercises}
        defaultChatter={chatterLevel as IntroChatterLevel}
        defaultRepPaceSec={repPaceSec}
        onChangeChatter={(c) => setChatterLevel(c as ChatterLevel)}
        onChangeRepPace={setRepPaceSec}
        onOpenPreflight={() => setStage('preflight')}
        onBegin={() => {
          // If there are rep blocks and user might want preflight, could route there
          // For now, go straight to playing
          const hasRepBlocks = blocks.some(b => b.params?.mode === 'reps');
          if (hasRepBlocks) {
            setStage('preflight');
          } else {
            setStage('playing');
          }
        }}
      />
    );
  }

  if (stage === 'preflight') {
    return (
      <PreflightWeightsSheet
        exercises={exercises}
        lastLoads={{}} // No previous loads for testing
        onSave={(p) => { setPlanned(p); setStage('playing'); }}
        onCancel={() => setStage('intro')}
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
