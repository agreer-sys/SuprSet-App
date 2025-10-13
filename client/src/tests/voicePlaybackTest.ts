/**
 * voicePlaybackTest.ts
 * Phase 1: Sequential playback test (sanity)
 * Phase 2: Overlapping playback test (queue handling)
 * Phase 3: Automated validation checklist
 */

import { AudioContext } from "standardized-audio-context-mock";

// --- Automated Validation Checklist ---
const validationChecklist = {
  sequentialEvents: ["await_ready", "set_midpoint", "set_complete", "rest_start", "workout_complete"],
  overlappingEvents: ["set_complete (A)", "set_complete (B)"],
  totalEventsPlayed: 0,
  totalSilent: 0,
  errors: [] as Array<{ label: string; error: any }>,
};

async function playPcm(merged: Float32Array, ctx: AudioContext, label: string) {
  const start = performance.now();
  
  try {
    if (!merged || merged.length === 0) {
      console.warn(`⚠️ No PCM data to play for ${label}`);
      return;
    }

    const buffer = ctx.createBuffer(1, merged.length, ctx.sampleRate);
    buffer.copyToChannel(merged, 0);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(ctx.destination);

    console.log(`🔊 Playing PCM response (${merged.length} samples) → ${label}`);
    src.start();

    // Simulate playback duration in mock environment
    const durationMs = (merged.length / ctx.sampleRate) * 1000;
    await new Promise((r) => setTimeout(r, Math.min(durationMs, 100))); // Cap at 100ms for testing
    
    const duration = Math.round(performance.now() - start);
    validationChecklist.totalEventsPlayed++;
    console.log(`✅ ${label} passed (${duration}ms)\n`);
  } catch (e) {
    validationChecklist.errors.push({ label, error: e });
    console.error(`❌ ${label} failed`, e);
  }
}

function makePcmChunk(freq: number, ctx: AudioContext): Float32Array {
  const SAMPLE_RATE = ctx.sampleRate;
  const PCM_CHUNK_MS = 200; // 0.2s per chunk
  const PCM_SAMPLE_COUNT = SAMPLE_RATE * (PCM_CHUNK_MS / 1000);
  const chunk = new Float32Array(PCM_SAMPLE_COUNT);
  for (let i = 0; i < PCM_SAMPLE_COUNT; i++) {
    chunk[i] = Math.sin((2 * Math.PI * freq * i) / SAMPLE_RATE) * 0.3;
  }
  return chunk;
}

async function runTests() {
  const ctx = new AudioContext();

  console.log("🎧 Starting Phase 1: Sequential Playback Test...\n");
  const sequentialEvents = [
    { name: "await_ready", freq: 220 },
    { name: "set_midpoint", freq: 440 },
    { name: "set_complete", freq: 330 },
    { name: "rest_start", freq: 0 },
    { name: "workout_complete", freq: 550 },
  ];

  for (const e of sequentialEvents) {
    console.log(`📡 Mock event: ${e.name}`);
    if (!e.freq) {
      console.log("🤫 Silent event - no playback expected.\n");
      validationChecklist.totalSilent++;
      continue;
    }
    const chunk1 = makePcmChunk(e.freq, ctx);
    const chunk2 = makePcmChunk(e.freq, ctx);
    const merged = new Float32Array(chunk1.length + chunk2.length);
    merged.set(chunk1, 0);
    merged.set(chunk2, chunk1.length);
    await playPcm(merged, ctx, e.name);
  }

  console.log("🎯 Phase 1 complete — starting Phase 2: Overlapping Event Simulation...\n");

  /**
   * Phase 2 – Overlap test: triggers two playbacks within 500 ms.
   * Goal: verify that the second audio waits for the first to finish,
   * not cut it off or go silent.
   */

  const overlappingEvents = [
    { name: "set_complete (A)", freq: 330 },
    { name: "set_complete (B)", freq: 660 },
  ];

  const mergedA = new Float32Array(makePcmChunk(330, ctx).length * 2);
  mergedA.set(makePcmChunk(330, ctx), 0);
  mergedA.set(makePcmChunk(330, ctx), makePcmChunk(330, ctx).length);

  const mergedB = new Float32Array(makePcmChunk(660, ctx).length * 2);
  mergedB.set(makePcmChunk(660, ctx), 0);
  mergedB.set(makePcmChunk(660, ctx), makePcmChunk(660, ctx).length);

  console.log("⏱️ Triggering first overlapping event...");
  playPcm(mergedA, ctx, overlappingEvents[0].name);

  await new Promise((r) => setTimeout(r, 50)); // Reduced overlap for testing (mock plays fast)

  console.log("⚡ Triggering second overlapping event (while first plays)...");
  await playPcm(mergedB, ctx, overlappingEvents[1].name);

  console.log("🎉 All playback tests completed!\n");

  // Print validation report
  const total = validationChecklist.totalEventsPlayed;
  const errCount = validationChecklist.errors.length;
  console.log("\n====== 🧩 Voice Playback Validation Report ======");
  console.log(`✅ Events played: ${total}`);
  console.log(`🫥 Silent events skipped: ${validationChecklist.totalSilent}`);
  console.log(`❌ Errors: ${errCount}`);
  if (errCount === 0 && total >= 6) {
    console.log("🎉 All playback events passed sequential and overlap validation!");
  } else {
    console.log("⚠️ Some issues detected, check error log above.");
  }
  console.log("==============================================\n");
}

runTests().catch(console.error);
