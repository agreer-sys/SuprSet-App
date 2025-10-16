import type { Event } from '@/types/coach';

// Server timeline step format
interface TimelineStep {
  step: number;
  type: string;
  text?: string;
  exercise?: {
    id: number;
    name: string;
    cues: string[];
    equipment: string[];
    muscleGroup: string;
  };
  atMs: number;
  endMs: number;
  durationSec?: number;
  set?: number;
  round?: number;
  label?: string;
  coachPrompt?: string;
}

interface ExecutionTimeline {
  workoutHeader: {
    name: string;
    totalDurationSec: number;
    structure: string;
  };
  executionTimeline: TimelineStep[];
  sync: {
    workoutStartEpochMs: number;
    resyncEveryMs: number;
    allowedDriftMs: number;
  };
}

type EventSubscriber = (ev: Event) => void;

export class TimelinePlayer {
  private subs: EventSubscriber[] = [];
  private timeouts: NodeJS.Timeout[] = [];
  private startTime: number = 0;
  private isPaused: boolean = false;

  subscribe(fn: EventSubscriber) {
    this.subs.push(fn);
    return () => {
      this.subs = this.subs.filter((s) => s !== fn);
    };
  }

  private emit(ev: Event) {
    this.subs.forEach((s) => s(ev));
  }

  // Map server step types to coach event types
  private mapStepToEvent(step: TimelineStep, isStart: boolean): Event | null {
    const exerciseId = step.exercise?.id?.toString() || 'unknown';
    
    switch (step.type) {
      case 'instruction':
        if (isStart) {
          return { type: 'EV_BLOCK_START', blockId: 'block-1' };
        }
        return null;

      case 'countdown':
        if (isStart) {
          return { type: 'EV_COUNTDOWN', sec: step.durationSec || 3 };
        }
        return null;

      case 'work':
        if (isStart) {
          return { type: 'EV_WORK_START', exerciseId };
        } else {
          return { type: 'EV_WORK_END', exerciseId };
        }

      case 'rest':
        if (isStart) {
          return { type: 'EV_REST_START', sec: step.durationSec || 90, reason: 'between_sets' };
        } else {
          return { type: 'EV_REST_END' };
        }

      case 'round_rest':
        if (isStart) {
          return { type: 'EV_ROUND_REST_START', sec: step.durationSec || 60 };
        } else {
          return { type: 'EV_ROUND_REST_END' };
        }

      case 'await_ready':
        if (isStart) {
          return { type: 'EV_AWAIT_READY', blockId: 'block-1' };
        }
        return null;

      default:
        return null;
    }
  }

  start(timeline: ExecutionTimeline) {
    this.stop(); // Clear any existing timeouts
    this.startTime = Date.now();
    this.isPaused = false;

    const steps = timeline.executionTimeline;
    
    // Emit initial block start
    this.emit({ type: 'EV_BLOCK_START', blockId: 'block-1' });

    // Schedule all step events
    steps.forEach((step, index) => {
      // Start event
      const startEvent = this.mapStepToEvent(step, true);
      if (startEvent) {
        const timeout = setTimeout(() => {
          if (!this.isPaused) {
            this.emit(startEvent);
          }
        }, step.atMs);
        this.timeouts.push(timeout);
      }

      // End event (for steps with duration)
      if (step.endMs > step.atMs) {
        const endEvent = this.mapStepToEvent(step, false);
        if (endEvent) {
          const timeout = setTimeout(() => {
            if (!this.isPaused) {
              this.emit(endEvent);
            }
          }, step.endMs);
          this.timeouts.push(timeout);
        }
      }

      // Block end after last step
      if (index === steps.length - 1) {
        const timeout = setTimeout(() => {
          if (!this.isPaused) {
            this.emit({ type: 'EV_BLOCK_END', blockId: 'block-1' });
            setTimeout(() => {
              this.emit({ type: 'EV_WORKOUT_END' });
            }, 1000);
          }
        }, step.endMs + 1000);
        this.timeouts.push(timeout);
      }
    });
  }

  stop() {
    this.timeouts.forEach((t) => clearTimeout(t));
    this.timeouts = [];
  }

  pause() {
    this.isPaused = true;
  }

  resume() {
    this.isPaused = false;
  }
}
