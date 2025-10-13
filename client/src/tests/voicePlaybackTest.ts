/**
 * voicePlaybackTest.ts
 * Simulates SuprSet AI Coach event flow using mock PCM16 audio chunks.
 * Purpose: validate playback queue, event timing, and buffer handling.
 */

import { AudioContext } from "standardized-audio-context-mock";

async function simulateCoachEvents() {
  const ctx = new AudioContext();
  const SAMPLE_RATE = ctx.sampleRate;
  const PCM_CHUNK_MS = 200; // 0.2s per chunk
  const PCM_SAMPLE_COUNT = SAMPLE_RATE * (PCM_CHUNK_MS / 1000);

  // Generate fake PCM16 Float32 data (sine wave blip)
  const makePcmChunk = (freq: number) => {
    const chunk = new Float32Array(PCM_SAMPLE_COUNT);
    for (let i = 0; i < PCM_SAMPLE_COUNT; i++) {
      chunk[i] = Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE) * 0.3;
    }
    return chunk;
  };

  const eventList = [
    { name: "await_ready", freq: 220 },
    { name: "set_midpoint", freq: 440 },
    { name: "set_complete", freq: 330 },
    { name: "rest_start", freq: 0 }, // silent
    { name: "workout_complete", freq: 550 },
  ];

  console.log("🎧 Starting mock playback test...\n");

  for (const event of eventList) {
    console.log(`📡 Mock event: ${event.name}`);

    // Simulate incoming PCM chunks (like Realtime API audio.delta)
    const chunks = event.freq
      ? [makePcmChunk(event.freq), makePcmChunk(event.freq)]
      : [];

    if (chunks.length === 0) {
      console.log("🤫 Silent event - no playback expected.\n");
      continue;
    }

    // Merge PCM chunks
    const totalLength = chunks.reduce((a, b) => a + b.length, 0);
    const merged = new Float32Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }

    // Create audio buffer + play
    const buffer = ctx.createBuffer(1, merged.length, SAMPLE_RATE);
    buffer.copyToChannel(merged, 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);

    console.log(`🔊 Playing PCM response (${merged.length} samples)`);
    src.start();

    // Simulate playback duration in mock environment
    const durationMs = (merged.length / SAMPLE_RATE) * 1000;
    await new Promise((r) => setTimeout(r, Math.min(durationMs, 100))); // Cap at 100ms for testing
    console.log(`✅ Finished: ${event.name}\n`);
  }

  console.log("🎉 Mock voice playback validation complete!");
}

simulateCoachEvents().catch(console.error);
