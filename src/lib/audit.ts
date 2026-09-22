import { db } from "@/lib/db"
import { auditLog } from "@/lib/db/schema"
import type { Role } from "@/lib/types"

// Centralized audit-log entry point. This is the only place that should
// insert into `audit_log` — call this from a route/transition right after a
// write succeeds, the same way `lib/storage` centralizes uploads and
// `lib/mailer` centralizes sending mail.
//
// Usage:
//   await logAudit({
//     actor: me,
//     action: "MERCHANT_APPROVED",
//     entityType: "merchant",
//     entityId: updated.id,
//     description: `Approved merchant ${updated.businessName}`,
//   })

export interface AuditActor {
  userId: string
  name: string
  role: Role
}

export interface LogAuditInput {
  actor: AuditActor
  action: string
  entityType: string
  entityId?: string | null
  description: string
  metadata?: Record<string, unknown> | null
}

/**
 * Writes one audit-log row. Never throws — a logging failure must not break
 * the request it's describing, so any DB error is swallowed after being
 * logged to the console (mirrors the fire-and-forget posture of sendMail's
 * own failed_mail fallback insert).
 */
export async function logAudit(input: LogAuditInput): Promise<void> {
  try {
    await db.insert(auditLog).values({
      actorId: input.actor.userId,
      actorName: input.actor.name,
      actorRole: input.actor.role,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      description: input.description,
      metadata: input.metadata ?? null,
    })
  } catch (err) {
    console.error("[audit] Failed to write audit log entry:", err)
  }
}
