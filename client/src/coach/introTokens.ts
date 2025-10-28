// client/src/coach/introTokens.ts
// Helper to build block introduction lines for EV_BLOCK_START

export function buildBlockIntroLine(
  block: { id: string; params: any; exerciseIds: string[] },
  exercises: Array<{ id: string; name: string }>,
  repPaceSec?: number
): string {
  const p = block.params || {};
  const exIds = block.exerciseIds || [];
  const exCount = exIds.length;
  const firstName = exercises.find(e => e.id === exIds[0])?.name || 'first exercise';
  const pattern = ({
    superset: 'Superset',
    straight_sets: 'Straight Sets',
    circuit: 'Circuit'
  } as any)[p.pattern] || 'Block';
  
  if (p.mode === 'time') {
    // e.g., "Circuit — 3 exercises • 30s on / 30s off. First up: Push-Ups."
    return `${pattern} — ${exCount} ${exCount === 1 ? 'exercise' : 'exercises'} • ${p.workSec || 0}s on / ${p.restSec || 0}s off. First up: ${firstName}.`;
  } else {
    // e.g., "Superset — 3 rounds • cadence 3:00. First up: Barbell Chest Press."
    const pace = repPaceSec ?? 180;
    const m = Math.floor(pace / 60);
    const s = String(pace % 60).padStart(2, '0');
    const rounds = p.setsPerExercise ?? 1;
    return `${pattern} — ${rounds} ${rounds === 1 ? 'round' : 'rounds'} • cadence ${m}:${s}. First up: ${firstName}.`;
  }
}
