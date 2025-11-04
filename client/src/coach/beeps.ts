// client/src/coach/beeps.ts
// 📦 PATCH: Smart Audio Cues by Event Type
// Chatter-aware beep system with differentiated tones

import { voiceBus } from '@/audio/voiceBus';

export type BeepKind = 'countdown'|'start'|'last5'|'end'|'confirm'|'10s';

const soundMap: Record<string, string> = {
  start: '/audio/beep_start.mp3',     // mid-tone for 3-2-1-GO
  '10s': '/audio/beep_10s.mp3',       // high-tone ping
  end: '/audio/beep_end.mp3',         // low-tone chime
  countdown: '/audio/beep_start.mp3', // reuse start for countdown
  last5: '/audio/beep_10s.mp3',       // reuse 10s for last5
  confirm: '/audio/beep_start.mp3',   // reuse start for confirm
};

class BeepEngine {
  private ctx?: AudioContext;
  private chatterLevel: 'silent'|'minimal'|'high' = 'minimal';

  ensureCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return this.ctx!;
  }

  init() {
    this.ensureCtx();
  }

  setChatterLevel(level: 'silent'|'minimal'|'high') {
    this.chatterLevel = level;
  }

  play(kind: BeepKind) {
    // Skip beeps in high chatter mode (voice cues replace them)
    if (this.chatterLevel === 'high') return;

    voiceBus.notifyBeep();

    const file = soundMap[kind] || soundMap.start;
    const audio = new Audio(file);
    audio.volume = 0.5; // Softer default (50%)
    audio.play().catch(() => {
      // Fallback: silent fail if audio file missing
      console.warn(`Audio file not found: ${file}`);
    });
  }

  /** Utility: schedule a sequence relative to now. Returns cancel(). */
  sequence(items: Array<{ atMs: number; kind: BeepKind }>): () => void {
    const tids: number[] = [];
    for (const it of items) {
      const id = window.setTimeout(() => this.play(it.kind), Math.max(0, it.atMs));
      tids.push(id);
    }
    return () => tids.forEach(clearTimeout);
  }

  // Legacy ducking support (no-op for now since audio files handle this)
  setDucker(_fn: any) {}
  setSignalsVolume(_mult: number) {}
}

export const beeps = new BeepEngine();

// Helper schedulers for rep-rounds and time-blocks
export function scheduleRepRoundBeeps(roundSec = 180, minutePips = true) {
  const items: Array<{ atMs: number; kind: BeepKind }> = [
    { atMs: 0, kind: 'countdown' },
    { atMs: 1000, kind: 'countdown' },
    { atMs: 2000, kind: 'start' },
  ];
  if (minutePips && roundSec >= 60) items.push({ atMs: 60_000, kind: 'countdown' });
  if (minutePips && roundSec >= 120) items.push({ atMs: 120_000, kind: 'countdown' });
  if (roundSec >= 12) items.push({ atMs: (roundSec - 10) * 1000, kind: 'last5' });
  items.push({ atMs: roundSec * 1000, kind: 'end' });
  return beeps.sequence(items);
}

export function scheduleTimeBlockBeeps(workSec: number, restSec: number) {
  const items: Array<{ atMs: number; kind: BeepKind }> = [
    { atMs: (restSec - 2) * 1000, kind: 'countdown' },
    { atMs: (restSec - 1) * 1000, kind: 'countdown' },
    { atMs: (restSec - 0) * 1000, kind: 'start' },
  ];
  if (workSec >= 7) items.push({ atMs: (restSec + workSec - 5) * 1000, kind: 'last5' });
  items.push({ atMs: (restSec + workSec) * 1000, kind: 'end' });
  return beeps.sequence(items);
}
