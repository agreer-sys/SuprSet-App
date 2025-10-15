import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Copy } from "lucide-react";

export default function WorkoutStructureDocs() {
  const { toast } = useToast();

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied to clipboard",
      description: "Content copied successfully",
    });
  };

  const fullDocumentation = `📦 SUPRSET WORKOUT STRUCTURE - TECHNICAL REFERENCE

═══════════════════════════════════════════════════════════════

1. BLOCK SYSTEM (Database: blocks table)
─────────────────────────────────────────

Block Types:
• custom_sequence → Main type for strength/cardio work (supports all patterns)
• transition → Rest/movement between blocks
• amrap_loop → AMRAP workouts
• emom_window → EMOM workouts

═══════════════════════════════════════════════════════════════

2. PATTERN TYPES (Inside custom_sequence blocks)
─────────────────────────────────────────────────

Stored in params.pattern:

┌─────────────────┬──────────────────────────────┬─────────────────────────────┐
│ Pattern         │ Structure                    │ Rest Logic                  │
├─────────────────┼──────────────────────────────┼─────────────────────────────┤
│ Superset        │ A1→A2→Rest → Repeat          │ Short restSec, no           │
│                 │                              │ roundRestSec                │
├─────────────────┼──────────────────────────────┼─────────────────────────────┤
│ Straight Sets   │ A1→Rest→A1→Rest→A2→Rest→A2  │ Standard restSec between    │
│                 │                              │ all sets                    │
├─────────────────┼──────────────────────────────┼─────────────────────────────┤
│ Circuit         │ A1→A2→A3→Round Rest → Repeat │ Short restSec, longer       │
│                 │                              │ roundRestSec                │
├─────────────────┼──────────────────────────────┼─────────────────────────────┤
│ Custom          │ User-defined                 │ Fully flexible params       │
└─────────────────┴──────────────────────────────┴─────────────────────────────┘

═══════════════════════════════════════════════════════════════

3. TIME VS REPS TOGGLE
──────────────────────

Stored in params (JSONB):

TIME-BASED (HIIT, AMRAP, EMOM):
{
  workSec: 30,        // 30 seconds of work
  restSec: 15,        // 15 seconds rest
  setsPerExercise: 3
}

REP-BASED (Traditional Strength):
{
  targetReps: "8-12", // Rep range goal
  restSec: 90,        // Rest between sets (still timed)
  setsPerExercise: 4
}

═══════════════════════════════════════════════════════════════

4. DATABASE STRUCTURE
─────────────────────

blocks
  ├── id, name, description
  ├── type (custom_sequence, transition, etc.)
  └── params (JSONB) {
        pattern: "superset" | "straight_sets" | "circuit"
        workSec?: 30         // Time-based
        targetReps?: "12"    // Rep-based (mutually exclusive)
        restSec: 60
        roundRestSec: 0
        setsPerExercise: 3
      }

block_exercises (junction table)
  ├── block_id → blocks.id
  ├── exercise_id → exercises.id
  └── position (order in block)

═══════════════════════════════════════════════════════════════

5. COMPILER FLOW
────────────────

Block (params) → Compiler → ExecutionTimeline (flat steps)
                              ↓
                         [await_ready, work, rest, work, rest...]
                              ↓
                         Coach observes events

═══════════════════════════════════════════════════════════════

6. KEY PARAMS REFERENCE
───────────────────────

Common Block Parameters (params object):
• setsPerExercise: number          - Sets per exercise
• workSec: number                  - Work duration (time-based)
• targetReps: string               - Rep goal (rep-based)
• restSec: number                  - Rest between exercises/sets
• roundRestSec: number             - Rest between circuit rounds
• transitionSec: number            - Transition duration
• durationSec: number              - Total block duration
• awaitReadyBeforeStart: boolean   - Wait for user readiness
• pattern: string                  - "superset"|"straight_sets"|"circuit"|"custom"

EMOM/AMRAP Specific:
• minuteMarks: number[]            - EMOM minute markers
• maxDuration: number              - AMRAP max duration

Post-Workout Cardio:
• postCardio: {
    exercise: string,
    durationSec: number
  }

═══════════════════════════════════════════════════════════════

7. COACH LOGIC DETECTION
────────────────────────

The AI coach needs to detect:
1. params.pattern → superset/straight/circuit
2. params.workSec vs params.targetReps → time vs reps
3. Current step context → first set, final set, transition

This tells the coach WHAT TO SAY and WHEN TO SPEAK.

═══════════════════════════════════════════════════════════════`;

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">
              Workout Structure Documentation
            </h1>
            <p className="text-muted-foreground mt-2">
              Technical reference for SuprSet's block-based workout architecture
            </p>
          </div>
          <Button
            onClick={() => copyToClipboard(fullDocumentation)}
            className="gap-2"
            data-testid="button-copy-all"
          >
            <Copy className="w-4 h-4" />
            Copy All
          </Button>
        </div>

        {/* 1. Block System */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              1. Block System
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  copyToClipboard(`Block Types:
• custom_sequence → Main type for strength/cardio work (supports all patterns)
• transition → Rest/movement between blocks
• amrap_loop → AMRAP workouts
• emom_window → EMOM workouts`)
                }
                data-testid="button-copy-block-system"
              >
                <Copy className="w-3 h-3" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="font-mono text-sm bg-muted p-4 rounded-lg">
              <p className="font-semibold mb-2">
                Database: <code>blocks</code> table
              </p>
              <ul className="space-y-1 ml-4">
                <li>
                  • <code>custom_sequence</code> → Main type for strength/cardio
                  work (supports all patterns)
                </li>
                <li>
                  • <code>transition</code> → Rest/movement between blocks
                </li>
                <li>
                  • <code>amrap_loop</code> → AMRAP workouts
                </li>
                <li>
                  • <code>emom_window</code> → EMOM workouts
                </li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* 2. Pattern Types */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              2. Pattern Types (Inside custom_sequence)
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  copyToClipboard(`Pattern Types:
Superset: A1→A2→Rest → Repeat (Short restSec, no roundRestSec)
Straight Sets: A1→Rest→A1→Rest→A2→Rest→A2 (Standard restSec between all sets)
Circuit: A1→A2→A3→Round Rest → Repeat (Short restSec, longer roundRestSec)
Custom: User-defined (Fully flexible params)`)
                }
                data-testid="button-copy-patterns"
              >
                <Copy className="w-3 h-3" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-semibold">Pattern</th>
                    <th className="text-left p-3 font-semibold">Structure</th>
                    <th className="text-left p-3 font-semibold">Rest Logic</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  <tr className="border-b">
                    <td className="p-3">Superset</td>
                    <td className="p-3">A1→A2→Rest → Repeat</td>
                    <td className="p-3">Short restSec, no roundRestSec</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-3">Straight Sets</td>
                    <td className="p-3">A1→Rest→A1→Rest→A2→Rest→A2</td>
                    <td className="p-3">Standard restSec between all sets</td>
                  </tr>
                  <tr className="border-b">
                    <td className="p-3">Circuit</td>
                    <td className="p-3">A1→A2→A3→Round Rest → Repeat</td>
                    <td className="p-3">Short restSec, longer roundRestSec</td>
                  </tr>
                  <tr>
                    <td className="p-3">Custom</td>
                    <td className="p-3">User-defined</td>
                    <td className="p-3">Fully flexible params</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* 3. Time vs Reps */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              3. Time vs Reps Toggle
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  copyToClipboard(`TIME-BASED: { workSec: 30, restSec: 15, setsPerExercise: 3 }
REP-BASED: { targetReps: "8-12", restSec: 90, setsPerExercise: 4 }`)
                }
                data-testid="button-copy-time-reps"
              >
                <Copy className="w-3 h-3" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold mb-2">
                TIME-BASED (HIIT, AMRAP, EMOM)
              </h3>
              <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
                {`{
  workSec: 30,        // 30 seconds of work
  restSec: 15,        // 15 seconds rest
  setsPerExercise: 3
}`}
              </pre>
            </div>
            <div>
              <h3 className="font-semibold mb-2">
                REP-BASED (Traditional Strength)
              </h3>
              <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
                {`{
  targetReps: "8-12", // Rep range goal
  restSec: 90,        // Rest between sets (still timed)
  setsPerExercise: 4
}`}
              </pre>
            </div>
          </CardContent>
        </Card>

        {/* 4. Database Structure */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              4. Database Structure
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  copyToClipboard(`blocks table:
- id, name, description
- type: custom_sequence | transition | amrap_loop | emom_window
- params (JSONB): { pattern, workSec/targetReps, restSec, roundRestSec, setsPerExercise }

block_exercises (junction):
- block_id → blocks.id
- exercise_id → exercises.id
- position`)
                }
                data-testid="button-copy-db-structure"
              >
                <Copy className="w-3 h-3" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
              {`blocks
  ├── id, name, description
  ├── type (custom_sequence, transition, etc.)
  └── params (JSONB) {
        pattern: "superset" | "straight_sets" | "circuit"
        workSec?: 30         // Time-based
        targetReps?: "12"    // Rep-based (mutually exclusive)
        restSec: 60
        roundRestSec: 0
        setsPerExercise: 3
      }

block_exercises (junction table)
  ├── block_id → blocks.id
  ├── exercise_id → exercises.id
  └── position (order in block)`}
            </pre>
          </CardContent>
        </Card>

        {/* 5. Key Params Reference */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              5. Key Params Reference
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  copyToClipboard(`Block Params:
• setsPerExercise - Sets per exercise
• workSec - Work duration (time-based)
• targetReps - Rep goal (rep-based)
• restSec - Rest between exercises/sets
• roundRestSec - Rest between circuit rounds
• pattern - "superset"|"straight_sets"|"circuit"|"custom"
• awaitReadyBeforeStart - Wait for user readiness`)
                }
                data-testid="button-copy-params"
              >
                <Copy className="w-3 h-3" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold mb-2">
                  Common Block Parameters (params object)
                </h3>
                <ul className="space-y-1 text-sm font-mono ml-4">
                  <li>
                    • <code>setsPerExercise</code>: number - Sets per exercise
                  </li>
                  <li>
                    • <code>workSec</code>: number - Work duration (time-based)
                  </li>
                  <li>
                    • <code>targetReps</code>: string - Rep goal (rep-based)
                  </li>
                  <li>
                    • <code>restSec</code>: number - Rest between exercises/sets
                  </li>
                  <li>
                    • <code>roundRestSec</code>: number - Rest between circuit
                    rounds
                  </li>
                  <li>
                    • <code>transitionSec</code>: number - Transition duration
                  </li>
                  <li>
                    • <code>durationSec</code>: number - Total block duration
                  </li>
                  <li>
                    • <code>awaitReadyBeforeStart</code>: boolean - Wait for
                    user readiness
                  </li>
                  <li>
                    • <code>pattern</code>: string -
                    "superset"|"straight_sets"|"circuit"|"custom"
                  </li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold mb-2">EMOM/AMRAP Specific</h3>
                <ul className="space-y-1 text-sm font-mono ml-4">
                  <li>
                    • <code>minuteMarks</code>: number[] - EMOM minute markers
                  </li>
                  <li>
                    • <code>maxDuration</code>: number - AMRAP max duration
                  </li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 6. Coach Logic Detection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              6. Coach Logic Detection
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  copyToClipboard(`Coach Detection Points:
1. params.pattern → superset/straight/circuit
2. params.workSec vs params.targetReps → time vs reps
3. Current step context → first set, final set, transition

This tells the coach WHAT TO SAY and WHEN TO SPEAK.`)
                }
                data-testid="button-copy-coach-logic"
              >
                <Copy className="w-3 h-3" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-muted p-4 rounded-lg">
              <p className="font-semibold mb-3">
                The AI coach needs to detect:
              </p>
              <ol className="space-y-2 text-sm ml-4">
                <li>
                  1.{" "}
                  <code className="bg-background px-2 py-0.5 rounded">
                    params.pattern
                  </code>{" "}
                  → superset/straight/circuit
                </li>
                <li>
                  2.{" "}
                  <code className="bg-background px-2 py-0.5 rounded">
                    params.workSec
                  </code>{" "}
                  vs{" "}
                  <code className="bg-background px-2 py-0.5 rounded">
                    params.targetReps
                  </code>{" "}
                  → time vs reps
                </li>
                <li>
                  3. Current step context → first set, final set, transition
                </li>
              </ol>
              <p className="mt-4 text-sm font-semibold">
                This tells the coach{" "}
                <span className="text-primary">WHAT TO SAY</span> and{" "}
                <span className="text-primary">WHEN TO SPEAK</span>.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 7. Compiler Flow */}
        <Card>
          <CardHeader>
            <CardTitle>7. Compiler Flow</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto">
              {`Block (params) → Compiler → ExecutionTimeline (flat steps)
                              ↓
                         [await_ready, work, rest, work, rest...]
                              ↓
                         Coach observes events`}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
