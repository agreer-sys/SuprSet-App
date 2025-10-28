// Feature flags for staged rollout and easy rollback
// Toggle via URL param (?coachV2=1) or environment

export const FLAGS = {
  // Coach V2: Advanced rep-round timing, block intros, downstream tech hints
  // Default: true for internal testing; set to false for safe rollback
  COACH_V2: (typeof window !== 'undefined' && new URLSearchParams(location.search).has('coachV2')) || true,
};
