/**
 * Admin Audit Logging - Canonical Admin
 * 
 * Tracks all admin actions for accountability and rollback capability.
 */

import type { InsertAdminAudit } from "@shared/schema";
import { db } from "./db";
import { adminAudit } from "@shared/schema";

export async function logAdminAction(
  actorId: string,
  action: "create" | "update" | "delete" | "publish" | "unpublish",
  entity: "workout" | "block" | "block_exercise",
  entityId: number,
  before?: any,
  after?: any
): Promise<void> {
  try {
    await db.insert(adminAudit).values({
      actorId,
      action,
      entity,
      entityId,
      before: before || null,
      after: after || null,
    });
  } catch (error) {
    console.error("Failed to log admin action:", error);
    // Don't throw - audit logging failure shouldn't break the main operation
  }
}
