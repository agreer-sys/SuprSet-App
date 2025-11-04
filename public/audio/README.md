# Audio Files Required

This directory needs three audio files for the beep system:

## Required Files:

1. **beep_start.mp3** - Mid-tone beep for countdown (3-2-1-GO)
   - Duration: ~200ms
   - Frequency: ~520 Hz (mid C)
   - Volume: Soft, earbud-friendly

2. **beep_10s.mp3** - High-tone ping for "10 seconds left"
   - Duration: ~150ms
   - Frequency: ~880 Hz (high A)
   - Volume: Soft, gentle ping

3. **beep_end.mp3** - Low-tone chime for "work complete"
   - Duration: ~300ms
   - Frequency: ~440 Hz (A note)
   - Volume: Soft, smooth tail-off

## Characteristics:
- All sounds should be 50% volume or lower
- Sine wave tones (least fatiguing for earbuds)
- Smooth attack/release envelopes (no harsh edges)
- Low-pass filtered to remove harshness

## Fallback:
If files are missing, the system will fail silently and log a warning to the console.
