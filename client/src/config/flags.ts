// Feature flags for staged rollout and easy rollback
// Toggle via URL param (?coachV2=1) or environment

export const FLAGS = {
  // Coach V2: Advanced rep-round timing, block intros, downstream tech hints
  // Default: false for safe rollback; enable via ?coachV2 URL param
  COACH_V2: typeof window !== 'undefined' && new URLSearchParams(location.search).has('coachV2'),
  
  // Browser TTS: Use free browser TTS instead of OpenAI Realtime API
  // Default: TRUE for testing without API quota
  // Add ?realtimeAPI to switch back to OpenAI when needed
  BROWSER_TTS: typeof window !== 'undefined' 
    ? !new URLSearchParams(location.search).has('realtimeAPI')
    : true,
};
