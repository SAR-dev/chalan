import { and, eq, lt, sql } from "drizzle-orm"
import { db, dbRead } from "@/lib/db"
import { auditLog, emailLog, session, verification } from "@/lib/db/schema"
import { drainEmailOutbox } from "@/lib/email-outbox"
import {
  DEFAULT_AUDIT_LOG_RETENTION_DAYS,
  DEFAULT_EMAIL_LOG_RETENTION_DAYS,
} from "@/lib/env"
import { logger } from "@/lib/logger"
import { deleteFile, listFiles } from "@/lib/storage"
import {
  collectReferencedKeys,
  findOrphans,
  type ImageColumnSource,
  isOrphan,
  readMinAgeHours,
  readSweepBases,
} from "@/lib/upload-sweep"
import { drainWebhooks } from "@/lib/webhooks"

// =============================================================================
// Maintenance jobs
//
// The bodies of the six cron routes, extracted so there is exactly one
// implementation of each and two schedulers can share them: the per-route
// endpoints that `docker/compose.cluster.yml` drives from its own crontab, and
// `/api/cron/maintenance`, which collapses all six into a single registration
// for hosts whose cron quota is smaller than the job count.
//
// Nothing about a job's behaviour lives here — no auth, no HTTP, no `ranAt`
// stamping. Each function returns a plain result object; the route decides how
// to present it. That keeps these testable without a Request.
// =============================================================================

/** Delivers queued transactional email left behind by a crashed invocation. */
export async function runDrainEmailOutbox() {
  return drainEmailOutbox({ limit: 50 })
}

/** Delivers queued webhooks left behind by a crashed invocation. */
export async function runDrainWebhooks() {
  return drainWebhooks({ limit: 50 })
}

export interface ExpiredAuthResult {
  deletedSessions: number
  deletedVerifications: number
}

/** Sessions and verification tokens past their expiry. */
export async function runCleanupSessions(): Promise<ExpiredAuthResult> {
  const now = sql`now()`
  const [deletedSessions, deletedVerifications] = await Promise.all([
    db
      .delete(session)
      .where(lt(session.expiresAt, now))
      .returning({ id: session.id }),
    db
      .delete(verification)
      .where(lt(verification.expiresAt, now))
      .returning({ id: verification.id }),
  ])
  return {
    deletedSessions: deletedSessions.length,
    deletedVerifications: deletedVerifications.length,
  }
}

export interface AuditLogCleanupResult {
  deletedAuditLogs: number
  retentionDays: number
}

/** Audit entries past the configured retention window. */
export async function runCleanupAuditLogs(): Promise<AuditLogCleanupResult> {
  const retentionDays = parseInt(
    process.env.AUDIT_LOG_RETENTION_DAYS ||
      `${DEFAULT_AUDIT_LOG_RETENTION_DAYS}`,
    10,
  )
  const cutoff = sql`now() - interval '1 day' * ${retentionDays}`
  const deleted = await db
    .delete(auditLog)
    .where(lt(auditLog.createdAt, cutoff))
    .returning({ id: auditLog.id })
  return { deletedAuditLogs: deleted.length, retentionDays }
}

export interface EmailLogCleanupResult {
  deletedEmailLogs: number
  retentionDays: number
}

/** Sent email log rows past the retention window. FAILED rows are preserved. */
export async function runCleanupEmailLogs(): Promise<EmailLogCleanupResult> {
  const retentionDays = parseInt(
    process.env.EMAIL_LOG_RETENTION_DAYS ||
      `${DEFAULT_EMAIL_LOG_RETENTION_DAYS}`,
    10,
  )
  const cutoff = sql`now() - interval '1 day' * ${retentionDays}`
  const deleted = await db
    .delete(emailLog)
    .where(and(eq(emailLog.status, "SENT"), lt(emailLog.createdAt, cutoff)))
    .returning({ id: emailLog.id })
  return { deletedEmailLogs: deleted.length, retentionDays }
}

function readImageValues({
  table,
  column,
}: ImageColumnSource): Promise<unknown[]> {
  return dbRead
    .select({ value: column })
    .from(table)
    .then((rows) => rows.map((row) => row.value))
}

export interface UploadSweepResult {
  scanned: number
  orphans: number
  deleted: number
  failed: number
  bytesFreed: number
  dryRun: boolean
}

/** Deletes files in storage that no image column references. */
export async function runCleanupUploads({
  dryRun = false,
}: {
  dryRun?: boolean
} = {}): Promise<UploadSweepResult> {
  const minAgeHours = readMinAgeHours()
  const bases = readSweepBases()
  const now = new Date()

  const files = await listFiles()
  const referencedKeys = await collectReferencedKeys(readImageValues, bases)
  const orphans = findOrphans({
    files,
    referencedKeys,
    minAgeHours,
    now,
    bases,
  })

  let deleted = 0
  let failed = 0
  let bytesFreed = 0

  if (dryRun) {
    for (const file of orphans) {
      logger.info("cleanup-uploads dry-run orphan", {
        key: file.key,
        size: file.size,
      })
    }
  } else {
    // Safety rail: re-read the referenced set immediately before the delete
    // loop, so a file referenced between the listing and now (form submitted
    // seconds ago) is never removed off a stale snapshot.
    const freshKeys = await collectReferencedKeys(readImageValues, bases)

    for (const file of orphans) {
      const stillOrphan = isOrphan({
        key: file.key,
        lastModified: file.lastModified,
        referencedKeys: freshKeys,
        minAgeHours,
        now: new Date(),
        bases,
      })
      if (!stillOrphan) continue

      try {
        await deleteFile(file.key)
        deleted += 1
        bytesFreed += file.size
        logger.info("cleanup-uploads deleted", {
          key: file.key,
          size: file.size,
        })
      } catch (err) {
        // One bad file must never fail the whole job.
        failed += 1
        logger.error("Failed to delete orphaned upload", {
          key: file.key,
          err,
        })
      }
    }
  }

  return {
    scanned: files.length,
    orphans: orphans.length,
    deleted,
    failed,
    bytesFreed,
    dryRun,
  }
}
