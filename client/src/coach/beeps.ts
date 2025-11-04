// client/src/coach/beeps.ts
// Beep system using Web Audio API oscillators (no file loading needed)

import { voiceBus } from '@/audio/voiceBus';

export type BeepKind = 'countdown'|'start'|'last5'|'end'|'confirm'|'10s';

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
    console.log('[BEEP] 🎵 Web Audio API ready');
  }

  setChatterLevel(level: 'silent'|'minimal'|'high') {
    this.chatterLevel = level;
  }

  play(kind: BeepKind) {
    voiceBus.notifyBeep();
    
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;
    
    // Create oscillator for beep tone
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    // Beep characteristics based on type
    if (kind === 'countdown') {
      // Short pip: 800Hz, 100ms
      osc.frequency.value = 800;
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    } else if (kind === 'start') {
      // GO beep: 1000Hz, 150ms
      osc.frequency.value = 1000;
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
      osc.start(now);
      osc.stop(now + 0.15);
    } else if (kind === '10s' || kind === 'last5') {
      // Warning: 900Hz, 200ms
      osc.frequency.value = 900;
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (kind === 'end') {
      // End chime: two-tone, 600ms total
      osc.frequency.value = 1200;
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.15, now + 0.3);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
      
      // Drop to lower frequency at 300ms
      osc.frequency.setValueAtTime(1200, now);
      osc.frequency.setValueAtTime(800, now + 0.3);
      
      osc.start(now);
      osc.stop(now + 0.6);
    } else {
      // Default confirm beep
      osc.frequency.value = 800;
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
      osc.start(now);
      osc.stop(now + 0.1);
    }
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

  // Legacy ducking support (no-op for now)
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
