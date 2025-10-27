// client/src/audio/voiceBus.ts
// Single, shared bus for coach voice. Works with <audio>, MediaStream, or browser TTS.

export type VoiceSource = 'mediaElement' | 'mediaStream' | 'none';

function dbToGain(db: number){
  return Math.pow(10, db / 20);
}

class VoiceBus {
  private ac?: AudioContext;
  private voiceIn?: GainNode; // input gain for all voice sources
  private master?: GainNode; // final stage → destination
  private srcNodes: Array<MediaElementAudioSourceNode | MediaStreamAudioSourceNode> = [];
  private lastBeepAt = 0; // ms
  private ttsCooldownMs = 250; // block starting TTS within ± this window

  ensure(){
    if (!this.ac) {
      this.ac = new (window.AudioContext || (window as any).webkitAudioContext)();
      const ac = this.ac;
      this.voiceIn = ac.createGain();
      this.master = ac.createGain();
      this.voiceIn.gain.value = 1.0;
      this.master.gain.value = 1.0;
      this.voiceIn.connect(this.master).connect(ac.destination);
    }
    return this.ac!;
  }

  /** Attach a HTMLAudioElement (e.g., Realtime API audio tag) to the voice bus. */
  attachElement(el: HTMLAudioElement){
    const ac = this.ensure();
    const node = ac.createMediaElementSource(el);
    node.connect(this.voiceIn!);
    this.srcNodes.push(node);
  }

  /** Attach a MediaStream (e.g., RTCPeerConnection remote stream) to the voice bus. */
  attachStream(stream: MediaStream){
    const ac = this.ensure();
    const node = ac.createMediaStreamSource(stream);
    node.connect(this.voiceIn!);
    this.srcNodes.push(node);
  }

  /** Set absolute voice gain in dB (0 = unity). */
  setGainDb(db: number){
    this.ensure();
    const g = dbToGain(db);
    const t = this.ac!.currentTime;
    this.voiceIn!.gain.cancelScheduledValues(t);
    this.voiceIn!.gain.setTargetAtTime(g, t, 0.015);
  }

  /** Smooth duck: -6 dB for `ms`, then return. Idempotent if overlapping. */
  duck(ms = 250, depthDb = -6){
    this.ensure();
    const ac = this.ac!;
    const now = ac.currentTime;
    const g = this.voiceIn!.gain;
    
    // Record beep time for guard window
    this.lastBeepAt = Date.now();
    
    // Duck down to depthDb smoothly
    g.cancelScheduledValues(now);
    g.setValueAtTime(g.value, now);
    g.linearRampToValueAtTime(dbToGain(depthDb), now + 0.02); // 20ms duck down
    
    // Hold for duration, then ramp back up
    const duckSec = ms / 1000;
    g.linearRampToValueAtTime(dbToGain(depthDb), now + duckSec - 0.02);
    g.linearRampToValueAtTime(1.0, now + duckSec); // 20ms ramp up to unity
  }

  /** Check if enough time has passed since last beep to safely start TTS. */
  canStartTTS(): boolean {
    const elapsed = Date.now() - this.lastBeepAt;
    return elapsed > this.ttsCooldownMs;
  }

  /** Guard a TTS start: only execute `fn` if outside the cooldown window. Otherwise defer. */
  guardTTSStart(fn: () => void){
    if (this.canStartTTS()) {
      fn();
    } else {
      const delay = this.ttsCooldownMs - (Date.now() - this.lastBeepAt);
      setTimeout(() => fn(), Math.max(0, delay));
    }
  }
}

export const voiceBus = new VoiceBus();
