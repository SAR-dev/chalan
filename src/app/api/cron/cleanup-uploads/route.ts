// Finds and deletes orphaned uploads (ROADMAP 5.6) — files in storage that
// no image column references AND that are older than the grace period.
//
// The grace period (UPLOAD_SWEEP_MIN_AGE_HOURS, default 48) is mandatory:
// ImageUpload posts to /api/uploads on file select, so a fresh upload is
// legitimately unreferenced until its form is submitted.
//
// Authentication: callers must supply the CRON_SECRET as a Bearer token.
// This prevents arbitrary clients from triggering the route.
//
// Pass ?dryRun=1 to report what would be deleted without deleting anything.
// Run a dry run for a while before enabling deletes.
//
// Deployment options:
//   Docker cron container — see docker/compose.cluster.yml; pg_cron cannot
//               call HTTP, see scripts/setup-pg-cron.sql.
//   Vercel     — not scheduled on the free plan (like the audit/email jobs);
//               trigger manually or from an external scheduler.
//   Docker/VPS  — call with curl from crontab:
//               30 4 * * * curl -s -X POST https://your-domain/api/cron/cleanup-uploads \
//                 -H "Authorization: Bearer $CRON_SECRET" >> /var/log/app-cron.log 2>&1

import { NextResponse } from "next/server"
import { isAuthorizedCron } from "@/lib/cron-auth"
import { dbRead } from "@/lib/db"
import { deleteFile, listFiles } from "@/lib/storage"
import {
  collectReferencedKeys,
  findOrphans,
  type ImageColumnSource,
  isOrphan,
  readMinAgeHours,
  readSweepBases,
} from "@/lib/upload-sweep"
import { withErrorHandler } from "@/lib/with-error-handler"

function readImageValues({
  table,
  column,
}: ImageColumnSource): Promise<unknown[]> {
  return dbRead
    .select({ value: column })
    .from(table)
    .then((rows) => rows.map((row) => row.value))
}

export const POST = withErrorHandler(async (req: Request) => {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const dryRun = new URL(req.url).searchParams.get("dryRun") === "1"
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
      console.log("[cron/cleanup-uploads] dry-run orphan", file.key, file.size)
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
        console.log("[cron/cleanup-uploads] deleted", file.key, file.size)
      } catch (err) {
        // One bad file must never fail the whole job.
        failed += 1
        console.error("[cron/cleanup-uploads] failed to delete", file.key, err)
      }
    }
  }

  const result = {
    scanned: files.length,
    orphans: orphans.length,
    deleted,
    failed,
    bytesFreed,
    dryRun,
    ranAt: now.toISOString(),
  }

  console.log("[cron/cleanup-uploads]", result)
  return NextResponse.json(result)
})
