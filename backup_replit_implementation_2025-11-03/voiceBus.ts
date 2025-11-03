// /audio/voiceBus.ts
// Shared WebAudio gain bus for coach voice with smooth ducking and a guard window
// to avoid starting TTS inside the beep window.

function dbToGain(db: number){ return Math.pow(10, db / 20); }

export type VoiceSource = 'mediaElement' | 'mediaStream' | 'none';

class VoiceBus {
  private ac?: AudioContext;
  private voiceIn?: GainNode;   // input gain for all voice sources
  private master?: GainNode;    // final stage → destination
  private srcNodes: Array<MediaElementAudioSourceNode | MediaStreamAudioSourceNode> = [];

  private lastBeepAt = 0;       // epoch ms
  private ttsCooldownMs = 250;  // suppress new speech starts within ± this window

  // Lazily create audio graph
  ensure(){
    if (!this.ac) {
      this.ac = new (window.AudioContext || (window as any).webkitAudioContext)();
      const ac = this.ac;
      this.voiceIn = ac.createGain();
      this.master  = ac.createGain();
      this.voiceIn.gain.value = 1.0;
      this.master.gain.value  = 1.0;
      this.voiceIn.connect(this.master).connect(ac.destination);
    }
    return this.ac!;
  }

  /** Attach an <audio> element (e.g., Realtime API playback) to the bus. */
  attachElement(el: HTMLAudioElement){
    const ac = this.ensure();
    const node = ac.createMediaElementSource(el);
    node.connect(this.voiceIn!);
    this.srcNodes.push(node);
  }

  /** Attach a remote MediaStream (e.g., RTCPeerConnection ontrack) to the bus. */
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

  /** Smoothly duck voice by `depthDb` (default -6 dB) for `ms`. */
  duck(ms = 250, depthDb = -6){
    this.ensure();
    const ac = this.ac!;
    const now = ac.currentTime;
    const target = dbToGain(depthDb);
    // Down fast
    this.voiceIn!.gain.cancelScheduledValues(now);
    this.voiceIn!.gain.setTargetAtTime(target, now, 0.01);
    // Release after duration
    const releaseAt = now + Math.max(0.05, ms / 1000);
    this.voiceIn!.gain.setTargetAtTime(1.0, releaseAt, 0.04);
    this.lastBeepAt = Date.now();
  }

  /**
   * Generic guard: if a beep just fired, delay executing fn so beeps stay clean.
   * Used by both TTS and caption systems for unified collision avoidance.
   */
  guardStart<T>(fn: () => T, extraDelayMs = 0): T | void {
    const since = Date.now() - this.lastBeepAt;
    const wait  = Math.max(0, this.ttsCooldownMs - since) + extraDelayMs;
    if (wait <= 0) return fn();
    setTimeout(fn, wait);
  }

  /**
   * Legacy TTS guard - routes to generic guardStart.
   * @deprecated Use guardStart instead
   */
  guardTTSStart<T>(fn: () => T, extraDelayMs = 0): T | void {
    return this.guardStart(fn, extraDelayMs);
  }

  /**
   * Record that a beep occurred now (used by beep engine).
   */
  notifyBeep() {
    this.lastBeepAt = Date.now();
  }
}

export const voiceBus = new VoiceBus();
