import { z } from "zod";
import { BlockParams } from "./timeline";

export const ExerciseRef = z.object({
  exerciseId: z.number().int(),
  overrides: z.object({
    workSec: z.number().int().positive().optional(),
    restSec: z.number().int().nonnegative().optional(),
    targetReps: z.string().optional(),
    notes: z.string().optional(),
  }).optional(),
});

export const BlockDTO = z.object({
  name: z.string(),
  type: z.enum(["custom_sequence", "transition", "amrap_loop", "emom_window"]),
  params: BlockParams,
  exercises: z.array(ExerciseRef).optional(),
  order_index: z.number().int().nonnegative().optional(),
});

export const WorkoutDTO = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  blocks: z.array(BlockDTO).min(1),
});

export type WorkoutDTOType = z.infer<typeof WorkoutDTO>;
export type BlockDTOType = z.infer<typeof BlockDTO>;
export type ExerciseRefType = z.infer<typeof ExerciseRef>;
