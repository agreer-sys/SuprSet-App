/**
 * Coach Prompt Formatter - Database-backed Response System
 * 
 * Pure function for selecting and formatting coach prompts with:
 * - Pattern-aware filtering (superset, straight_sets, circuit)
 * - Mode-aware filtering (reps, time)
 * - Chatter-level filtering (silent, minimal, high)
 * - Cooldown tracking
 * - A2 eligibility (downstream tech cues after work_start)
 */

import { db } from "./db";
import { coachResponses } from "@shared/schema";
import { eq, and, or, lt } from "drizzle-orm";

export interface CoachPromptOptions {
  eventType: string;
  pattern?: "superset" | "straight_sets" | "circuit" | "custom";
  mode?: "time" | "reps";
  chatterLevel?: "silent" | "minimal" | "high";
  locale?: string;
  exerciseName?: string;
  nextExercise?: string;
  restSec?: number;
  cue?: string;
  tempoCue?: string;
  
  // A2 eligibility: Can we inject downstream tech cues?
  isA2Eligible?: boolean; // True if this is work_start event in rep-round workout
  chatterAware?: boolean; // True if we've already spoken recently
}

/**
 * Select coach response from database with filtering and cooldown
 */
export async function selectCoachResponse(
  options: CoachPromptOptions
): Promise<string | null> {
  const {
    eventType,
    pattern = "any",
    mode = "any",
    chatterLevel = "minimal",
    locale = "en-US",
    exerciseName,
    nextExercise,
    restSec,
    cue,
    tempoCue,
    isA2Eligible = false,
    chatterAware = false,
  } = options;

  try {
    // Query database for matching responses
    const candidates = await db
      .select()
      .from(coachResponses)
      .where(
        and(
          eq(coachResponses.active, true),
          eq(coachResponses.eventType, eventType),
          eq(coachResponses.locale, locale),
          or(
            eq(coachResponses.pattern, pattern),
            eq(coachResponses.pattern, "any")
          ),
          or(
            eq(coachResponses.mode, mode),
            eq(coachResponses.mode, "any")
          ),
          or(
            eq(coachResponses.chatterLevel, chatterLevel),
            eq(coachResponses.chatterLevel, "any")
          )
        )
      )
      .orderBy(coachResponses.priority); // Higher priority first

    if (candidates.length === 0) {
      return null;
    }

    // Filter by cooldown
    const now = new Date();
    const availableCandidates = candidates.filter((candidate) => {
      if (candidate.cooldownSec === 0) return true;
      if (!candidate.lastUsedAt) return true;
      
      const cooldownMs = candidate.cooldownSec * 1000;
      const timeSinceUse = now.getTime() - new Date(candidate.lastUsedAt).getTime();
      return timeSinceUse >= cooldownMs;
    });

    if (availableCandidates.length === 0) {
      // All responses are on cooldown, use lowest cooldown
      const sorted = [...candidates].sort((a, b) => {
        const timeA = a.lastUsedAt ? now.getTime() - new Date(a.lastUsedAt).getTime() : Infinity;
        const timeB = b.lastUsedAt ? now.getTime() - new Date(b.lastUsedAt).getTime() : Infinity;
        return timeB - timeA; // Most recently used last
      });
      const selected = sorted[sorted.length - 1];
      return formatTemplate(selected.textTemplate, options);
    }

    // Select highest priority available response
    const selected = availableCandidates[0];

    // Update usage tracking (fire and forget)
    db.update(coachResponses)
      .set({ 
        usageCount: selected.usageCount + 1,
        lastUsedAt: now
      })
      .where(eq(coachResponses.id, selected.id))
      .catch(err => console.error("Failed to update coach response usage:", err));

    return formatTemplate(selected.textTemplate, options);
  } catch (error) {
    console.error("Error selecting coach response:", error);
    return null;
  }
}

/**
 * Format template with token replacements
 * Supports: {{exercise}}, {{next}}, {{restSec}}, {{cue}}, {{tempoCue}}
 */
function formatTemplate(template: string, options: CoachPromptOptions): string {
  let formatted = template;

  // Replace tokens
  if (options.exerciseName) {
    formatted = formatted.replace(/\{\{exercise\}\}/g, options.exerciseName);
  }
  if (options.nextExercise) {
    formatted = formatted.replace(/\{\{next\}\}/g, options.nextExercise);
  }
  if (options.restSec !== undefined) {
    formatted = formatted.replace(/\{\{restSec\}\}/g, options.restSec.toString());
  }
  if (options.cue) {
    formatted = formatted.replace(/\{\{cue\}\}/g, options.cue);
  }
  if (options.tempoCue) {
    formatted = formatted.replace(/\{\{tempoCue\}\}/g, options.tempoCue);
  }

  return formatted;
}

/**
 * A2 Eligibility Check - Can we inject downstream tech cues?
 * 
 * Rules:
 * - Must be work_start event
 * - Must be rep-round workout (mode: reps)
 * - Must not have spoken recently (chatter-aware)
 */
export function isA2Eligible(
  eventType: string,
  mode: string | undefined,
  chatterAware: boolean
): boolean {
  return eventType === "work_start" && mode === "reps" && !chatterAware;
}
