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
  /**
   * Set when an admin is driving someone else's session (Better Auth
   * impersonation, surfaced by `requireSession`). Recorded in the entry's
   * metadata so the trail shows who is really acting (ROADMAP P0.5).
   */
  impersonatedBy?: string | null
}

export interface LogAuditInput {
  actor: AuditActor
  action: string
  entityType: string
  entityId?: string | null
  description: string
  metadata?: Record<string, unknown> | null
}

/** Transaction handle as returned by `db.transaction()`. */
export type AuditTx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Writes one audit-log row.
 *
 * Pass `tx` when the entry describes a write that is still open: the row is
 * then committed (or rolled back) together with the state change it describes,
 * so a crash can no longer leave a mutation without a trail (ROADMAP P1.4).
 * Inside a transaction a failure DOES propagate — the whole point is that the
 * audit row and the change are atomic.
 *
 * Without `tx` the write stays best-effort and never throws: a logging failure
 * must not break a request that has already been answered.
 */
export async function logAudit(
  input: LogAuditInput,
  tx?: AuditTx,
): Promise<void> {
  const metadata = input.actor.impersonatedBy
    ? {
        ...(input.metadata ?? {}),
        impersonatedBy: input.actor.impersonatedBy,
      }
    : input.metadata
  const values = {
    actorId: input.actor.userId,
    actorName: input.actor.name,
    actorRole: input.actor.role,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    description: input.description,
    metadata: metadata ?? null,
  }

  if (tx) {
    await tx.insert(auditLog).values(values)
    return
  }

  try {
    await db.insert(auditLog).values(values)
  } catch (err) {
    console.error("[audit] Failed to write audit log entry:", err)
  }
}
