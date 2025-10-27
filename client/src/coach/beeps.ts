// client/src/coach/beeps.ts
// Minimal, offline-safe beep engine + voice ducking.
// Usage: import { beeps } from '@/coach/beeps'; beeps.play('start')

type BeepKind = 'countdown'|'start'|'last5'|'end'|'confirm';

type DuckFn = (on: boolean, ms: number) => void; // implement to duck TTS/music

class BeepEngine {
  private ctx?: AudioContext;
  private ducker: DuckFn | null = null;

  // tones
  private F_SHORT = 880;   // Hz
  private F_LONG  = 660;   // Hz
  private DUR_SHORT = 0.22; // s
  private DUR_LONG  = 0.60; // s

  ensureCtx(){
    if (!this.ctx) this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    return this.ctx;
  }

  setDucker(fn: DuckFn){ this.ducker = fn; }

  private tone(freq:number, dur:number){
    const ac = this.ensureCtx();
    const t0 = ac.currentTime;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.85, t0 + 0.01);
    g.gain.linearRampToValueAtTime(0.85, t0 + dur - 0.05);
    g.gain.linearRampToValueAtTime(0.0, t0 + dur);
    o.connect(g).connect(ac.destination);
    o.start(t0);
    o.stop(t0 + dur);
    this.duck(Math.round(dur*1000));
  }

  private chirp(dur:number, f0:number, f1:number){
    const ac = this.ensureCtx();
    const t0 = ac.currentTime;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.linearRampToValueAtTime(f1, t0 + dur);
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.85, t0 + 0.01);
    g.gain.linearRampToValueAtTime(0.0, t0 + dur);
    o.connect(g).connect(ac.destination);
    o.start(t0);
    o.stop(t0 + dur);
    this.duck(Math.round(dur*1000));
  }

  private duck(ms:number){
    if (!this.ducker) return;
    try { this.ducker(true, ms); setTimeout(()=>this.ducker?.(false, ms), ms); } catch {}
  }

  play(kind: BeepKind){
    switch (kind) {
      case 'countdown': return this.tone(this.F_SHORT, this.DUR_SHORT);
      case 'start':     return this.tone(this.F_LONG,  this.DUR_LONG);
      case 'last5':     return this.tone(this.F_SHORT, this.DUR_SHORT);
      case 'end':       return this.tone(this.F_LONG,  this.DUR_LONG);
      case 'confirm':   return this.chirp(0.18, 880, 1320);
    }
  }

  /** Utility: schedule a sequence relative to now. Returns cancel(). */
  sequence(items: Array<{ atMs:number; kind: BeepKind }>): () => void {
    const tids: number[] = [];
    for (const it of items) {
      const id = window.setTimeout(() => this.play(it.kind), Math.max(0, it.atMs));
      tids.push(id);
    }
    return () => tids.forEach(clearTimeout);
  }
}

export const beeps = new BeepEngine();

// Helper schedulers for rep-rounds and time-blocks
export function scheduleRepRoundBeeps(roundSec = 180, minutePips = true){
  const items: Array<{ atMs:number; kind: BeepKind }> = [
    { atMs:    0, kind: 'countdown' },
    { atMs: 1000, kind: 'countdown' },
    { atMs: 2000, kind: 'start' },
  ];
  if (minutePips && roundSec >= 60) items.push({ atMs: 60_000, kind: 'countdown' });
  if (minutePips && roundSec >= 120) items.push({ atMs: 120_000, kind: 'countdown' });
  if (roundSec >= 12) items.push({ atMs: (roundSec-10)*1000, kind: 'last5' });
  items.push({ atMs: roundSec*1000, kind: 'end' });
  return beeps.sequence(items);
}

export function scheduleTimeBlockBeeps(workSec:number, restSec:number){
  const items: Array<{ atMs:number; kind: BeepKind }> = [
    { atMs: (restSec-2)*1000, kind: 'countdown' },
    { atMs: (restSec-1)*1000, kind: 'countdown' },
    { atMs: (restSec-0)*1000, kind: 'start' },
  ];
  if (workSec >= 7) items.push({ atMs: (restSec + workSec - 5)*1000, kind: 'last5' });
  items.push({ atMs: (restSec + workSec)*1000, kind: 'end' });
  return beeps.sequence(items);
}
