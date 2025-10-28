// client/src/components/WorkoutIntroSheet.tsx
// Pre-start overview & controls: Chatter picker, Pace picker, Preflight button

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  patternLabel, 
  modeLabel, 
  estimateBlockDurationSec, 
  blockSubtitle, 
  exerciseTargetsLine 
} from '@/coach/introHelpers';

export type ChatterLevel = 'silent' | 'minimal' | 'high';

export interface WorkoutIntroProps {
  workoutTitle?: string;
  blocks: Array<{ 
    id: string; 
    name?: string; 
    params: any; 
    exerciseIds: string[];
  }>;
  exercises: Array<{ 
    id: string; 
    name: string;
  }>;
  defaultChatter?: ChatterLevel;
  defaultRepPaceSec?: number;
  onChangeChatter?: (c: ChatterLevel) => void;
  onChangeRepPace?: (sec: number) => void;
  onOpenPreflight?: () => void;
  onBegin?: () => void;
}

export function WorkoutIntroSheet(props: WorkoutIntroProps) {
  const { 
    workoutTitle = "Today's Workout", 
    blocks, 
    exercises, 
    defaultChatter = 'minimal', 
    defaultRepPaceSec = 180, 
    onChangeChatter, 
    onChangeRepPace, 
    onBegin, 
    onOpenPreflight 
  } = props;

  const [chatter, setChatter] = useState<ChatterLevel>(defaultChatter);
  const [pace, setPace] = useState<number>(defaultRepPaceSec);

  const getEx = (id: string) => exercises.find(e => e.id === id);

  // Compute total time
  const totalSec = blocks.reduce((acc, b) => {
    const exCount = b.exerciseIds.length;
    const sec = estimateBlockDurationSec(
      { id: b.id, params: b.params }, 
      exCount, 
      pace
    );
    return acc + sec;
  }, 0);

  const repBlocks = blocks.filter(b => b.params?.mode === 'reps');
  const paceOptions = [150, 180, 210, 240]; // 2:30, 3:00, 3:30, 4:00

  function start() {
    console.log('🚀 Start Workout button clicked, onBegin:', typeof onBegin);
    onBegin?.();
  }

  function handleChatterChange(c: ChatterLevel) {
    setChatter(c);
    onChangeChatter?.(c);
  }

  function handlePaceChange(sec: number) {
    setPace(sec);
    onChangeRepPace?.(sec);
  }

  return (
    <div className="space-y-5 max-w-4xl mx-auto p-6">
      <header className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold">{workoutTitle}</h2>
          <p className="text-sm text-muted-foreground">
            ~{Math.round(totalSec / 60)} min total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Chatter</label>
          <div className="flex rounded-lg border px-1 py-0.5 gap-1">
            {(['silent', 'minimal', 'high'] as ChatterLevel[]).map(v => (
              <button
                key={v}
                className={`px-3 py-1 rounded-md text-sm transition-colors ${
                  chatter === v
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
                onClick={() => handleChatterChange(v)}
                data-testid={`chatter-${v}`}
              >
                {v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </header>

      {repBlocks.length > 0 && (
        <section className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
          <div className="text-sm flex-1">
            <div className="font-medium">Pace (rep rounds)</div>
            <div className="text-muted-foreground">Choose your cadence per round</div>
          </div>
          <div className="flex rounded-lg border px-1 py-0.5 gap-1">
            {paceOptions.map(sec => (
              <button
                key={sec}
                className={`px-3 py-1 rounded-md text-sm transition-colors ${
                  pace === sec
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                }`}
                onClick={() => handlePaceChange(sec)}
                data-testid={`pace-${sec}`}
              >
                {Math.floor(sec / 60)}:{String(sec % 60).padStart(2, '0')}
              </button>
            ))}
          </div>
          <Button 
            variant="outline" 
            onClick={() => {
              console.log('✈️ Preflight button clicked, onOpenPreflight:', typeof onOpenPreflight);
              onOpenPreflight?.();
            }}
            data-testid="button-preflight"
          >
            Preflight Weights
          </Button>
        </section>
      )}

      <section className="grid gap-4">
        {blocks.map((b, idx) => {
          const exCount = b.exerciseIds.length;
          const dur = estimateBlockDurationSec(
            { id: b.id, params: b.params }, 
            exCount, 
            pace
          );
          const title = `${String.fromCharCode(65 + idx)}. ${patternLabel(
            b.params.pattern
          )} • ${modeLabel(b.params.mode)} • ${Math.round(dur / 60)} min`;

          return (
            <Card key={b.id} data-testid={`block-card-${idx}`}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{title}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {blockSubtitle({ id: b.id, params: b.params }, exCount, pace)}
                </p>
                <ul className="text-sm list-disc ml-5">
                  {b.exerciseIds.map(eid => {
                    const ex = getEx(eid);
                    if (!ex) return null;
                    return (
                      <li key={eid}>
                        {exerciseTargetsLine({ id: b.id, params: b.params }, ex)}
                      </li>
                    );
                  })}
                </ul>
                {b.params.awaitReadyBeforeStart && (
                  <p className="text-xs text-muted-foreground">
                    Includes a ready check before starting.
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </section>

      <footer className="flex items-center justify-between pt-2">
        <p className="text-sm text-muted-foreground max-w-md">
          Beeps guide timing; I'll give brief form cues and collect load/reps during rest.
        </p>
        <Button 
          size="lg" 
          onClick={start}
          data-testid="button-start-workout"
        >
          Start Workout
        </Button>
      </footer>
    </div>
  );
}
