// client/src/coach/beeps.ts
// Soften beeps for earbuds - lower frequencies, gentle envelope, low-pass filter
// Usage: import { beeps } from '@/coach/beeps'; beeps.play('start')

import { voiceBus } from '@/audio/voiceBus';

export type BeepKind = 'countdown'|'start'|'last5'|'end'|'confirm';

type DuckFn = (on: boolean, ms: number) => void;

class BeepEngine {
  private ctx?: AudioContext;
  private ducker: DuckFn | null = null;

  // Softer defaults for earbuds
  private F_SHORT = 650;      // Hz  (was 880)
  private F_LONG  = 520;      // Hz  (was 660)
  private DUR_SHORT = 0.18;   // s   (was 0.22)
  private DUR_LONG  = 0.55;   // s   (was 0.60)
  private PEAK_GAIN_SHORT = 0.60; // (was 0.85)
  private PEAK_GAIN_LONG  = 0.55; // slightly lower (longer sounds feel louder)
  private LPF_HZ = 1600;      // gentle low-pass for harshness
  private ATTACK_S = 0.012;   // smooth onset
  private RELEASE_S = 0.12;   // smooth tail

  ensureCtx(){
    if (!this.ctx) this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    return this.ctx!;
  }

  setDucker(fn: DuckFn){ this.ducker = fn; }

  setSignalsVolume(mult: number){ // 0.0–1.0 master trim if you want a UI slider
    this.PEAK_GAIN_SHORT = Math.max(0, Math.min(1, 0.60 * mult));
    this.PEAK_GAIN_LONG  = Math.max(0, Math.min(1, 0.55 * mult));
  }

  private duck(ms:number){ 
    if (this.ducker){ 
      try{ 
        this.ducker(true, ms); 
        setTimeout(()=>this.ducker?.(false, ms), ms); 
      } catch {} 
    } 
  }

  private tone(freq:number, dur:number, peak:number){
    const ac = this.ensureCtx();
    const t0 = ac.currentTime;

    const osc = ac.createOscillator();
    osc.type = 'sine'; // sine is least-fatiguing; keep it
    osc.frequency.setValueAtTime(freq, t0);

    const g = ac.createGain();
    // Soft envelope
    g.gain.setValueAtTime(0.0, t0);
    g.gain.linearRampToValueAtTime(peak, t0 + this.ATTACK_S);
    g.gain.setValueAtTime(peak, t0 + Math.max(this.ATTACK_S, dur - this.RELEASE_S));
    g.gain.linearRampToValueAtTime(0.0, t0 + dur);

    // Gentle low-pass to remove edge
    const lpf = ac.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(this.LPF_HZ, t0);
    lpf.Q.setValueAtTime(0.7, t0);

    osc.connect(g).connect(lpf).connect(ac.destination);
    osc.start(t0); osc.stop(t0 + dur);

    this.duck(Math.round(dur * 1000));
  }

  private chirp(dur:number, f0:number, f1:number){
    const ac = this.ensureCtx();
    const t0 = ac.currentTime;
    const osc = ac.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, t0);
    osc.frequency.linearRampToValueAtTime(f1, t0 + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0, t0);
    g.gain.linearRampToValueAtTime(0.55, t0 + this.ATTACK_S);
    g.gain.linearRampToValueAtTime(0.0, t0 + dur);
    const lpf = ac.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.setValueAtTime(this.LPF_HZ, t0);
    lpf.Q.setValueAtTime(0.7, t0);
    osc.connect(g).connect(lpf).connect(ac.destination);
    osc.start(t0); osc.stop(t0 + dur);
    this.duck(Math.round(dur * 1000));
  }

  play(kind: BeepKind){
    voiceBus.notifyBeep();
    switch (kind){
      case 'countdown': return this.tone(this.F_SHORT, this.DUR_SHORT, this.PEAK_GAIN_SHORT);
      case 'start':     return this.tone(this.F_LONG,  this.DUR_LONG,  this.PEAK_GAIN_LONG);
      case 'last5':     return this.tone(this.F_SHORT, this.DUR_SHORT, this.PEAK_GAIN_SHORT);
      case 'end':       return this.tone(this.F_LONG,  this.DUR_LONG,  this.PEAK_GAIN_LONG);
      case 'confirm':   return this.chirp(0.16, 720, 1080);
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

// Wire beep ducking to voice bus
beeps.setDucker((on, ms) => {
  if (on) voiceBus.duck(ms);
});

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
