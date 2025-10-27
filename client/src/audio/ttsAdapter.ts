// client/src/audio/ttsAdapter.ts
// Browser TTS adapter with guard window to avoid speaking over beeps

import { voiceBus } from '@/audio/voiceBus';

export function speakTTS(text: string){
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = 'en-US';
  utter.rate = 1.0;
  utter.pitch = 1.0;
  utter.volume = 0.95; // base volume slightly lower to stay under beeps
  
  voiceBus.guardTTSStart(() => window.speechSynthesis.speak(utter));
}
