import { db } from "@/lib/db"
import { auditLog } from "@/lib/db/schema"
import { logger } from "@/lib/logger"
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
   * Metadata so the trail shows who is really acting.
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

function auditValues(input: LogAuditInput) {
  const metadata = input.actor.impersonatedBy
    ? {
        ...(input.metadata ?? {}),
        impersonatedBy: input.actor.impersonatedBy,
      }
    : input.metadata
  return {
    actorId: input.actor.userId,
    actorName: input.actor.name,
    actorRole: input.actor.role,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    description: input.description,
    metadata: metadata ?? null,
  }
}

/**
 * Writes one audit-log row.
 *
 * Pass `tx` when the entry describes a write that is still open: the row is
 * then committed (or rolled back) together with the state change it describes,
 * So a crash can no longer leave a mutation without a trail.
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
  const values = auditValues(input)

  if (tx) {
    await tx.insert(auditLog).values(values)
    return
  }

  try {
    await db.insert(auditLog).values(values)
  } catch (err) {
    logger.error("Failed to write audit log entry", { err })
  }
}

/**
 * Writes many audit rows in a single insert.
 *
 * A 100-order bulk transition used to issue one INSERT per row from inside the
 * transaction — 100 round trips holding the batch's locks open — and eight
 * other bulk endpoints did the same via `Promise.all(logAudit(...))`, which
 * additionally opened up to 100 pool connections at once. Same atomicity
 * contract as `logAudit`: with `tx` a failure propagates
 * so the trail and the change stay together; without it, best-effort.
 */
export async function logAuditMany(
  inputs: LogAuditInput[],
  tx?: AuditTx,
): Promise<void> {
  if (inputs.length === 0) return
  const rows = inputs.map(auditValues)

  if (tx) {
    await tx.insert(auditLog).values(rows)
    return
  }

  try {
    await db.insert(auditLog).values(rows)
  } catch (err) {
    logger.error("Failed to write audit log entries", {
      err,
      count: rows.length,
    })
  }
}
