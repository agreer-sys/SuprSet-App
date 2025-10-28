// client/src/ui/captionAdapter.ts
// Guard caption rendering to avoid collisions with beeps
// Ensures captions respect the same ±250ms guard window as TTS

import { voiceBus } from '@/audio/voiceBus';

export type CaptionHandler = (text: string) => void;

/**
 * Wrap caption handler with beep collision guard.
 * If a beep just fired, delays the caption until safe.
 */
export function makeGuardedCaption(print: CaptionHandler): CaptionHandler {
  return (text: string) => voiceBus.guardStart(() => print(text));
}
