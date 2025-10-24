// /coach/paceModel.ts
type ExMeta = { id:string; name:string; estimatedTimeSec?:number; unilateral?:boolean };

export type Window = { id:string; startSec:number; durSec:number; conf:number };

export class PaceModel {
  private roundSec: number;
  private metas: ExMeta[];

  // Simple EMA multiplier if you ever pass real completion signals (kept for future)
  private speedK = 1.0; // 1.0 = as estimated

  constructor(opts:{ roundSec:number; exercises: ExMeta[] }) {
    this.roundSec = opts.roundSec;
    this.metas = opts.exercises;
  }

  // Normalize estimated times (unilateral ~2x), then fill round
  computeWindows(): Window[] {
    const weighted = this.metas.map(m => {
      const base = m.estimatedTimeSec ?? 30;
      const w = base * (m.unilateral ? 2 : 1);
      return { ...m, w: Math.max(10, w) };
    });
    const total = weighted.reduce((s,m)=>s+m.w, 0) || 1;
    // Scale by round length (respect speedK if you wire learning later)
    const scale = (this.roundSec * this.speedK) / total;

    const windows: Window[] = [];
    let t = 0;
    weighted.forEach((m) => {
      const dur = Math.max(15, Math.round(m.w * scale)); // floor ≥15s
      // crude confidence: longer windows → higher confidence (cap at 1.0)
      const conf = Math.min(1, dur / 30);
      windows.push({ id:String(m.id), startSec: t, durSec: dur, conf });
      t += dur;
    });

    // Normalize to exactly roundSec (trim last)
    if (windows.length) {
      const overflow = t - this.roundSec;
      if (overflow > 0) windows[windows.length - 1].durSec = Math.max(10, windows[windows.length - 1].durSec - overflow);
    }
    return windows;
  }

  // Hook for future: if you capture earlier/later transitions, adjust speedK via EMA
  updateFromRoundFinish(actualRoundSec:number) {
    if (actualRoundSec <= 10) return;
    const ratio = actualRoundSec / this.roundSec;
    // light EMA toward actual (alpha 0.25)
    this.speedK = this.speedK * 0.75 + ratio * 0.25;
  }

  setRoundSec(roundSec:number){ this.roundSec = roundSec; }
}
