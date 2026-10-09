import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { conflict, forbidden, notFound } from "@/lib/api-response"
import { refreshStats, statTag } from "@/lib/cached-stats"
import { db } from "@/lib/db"
import { mailConfig } from "@/lib/db/schema"
import { isUniqueViolation } from "@/lib/db-errors"
import { withErrorHandler } from "@/lib/with-error-handler"

export const PATCH = withErrorHandler(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me || me.role !== "SUPER_ADMIN") return forbidden()

    const { id } = await params

    // Verify config exists
    const [existing] = await db
      .select({ id: mailConfig.id })
      .from(mailConfig)
      .where(eq(mailConfig.id, id))
      .limit(1)
    if (!existing) return notFound()

    // Deactivate all configs, then activate the selected one. The partial
    // unique index on `isActive = true` makes the invariant structural: if a
    // concurrent activate already claimed the single active slot, this is a
    // 409 rather than a silently overwritten config.
    try {
      await db.transaction(async (tx) => {
        await tx
          .update(mailConfig)
          .set({ isActive: false, updatedAt: new Date().toISOString() })
          .where(eq(mailConfig.isActive, true))

        await tx
          .update(mailConfig)
          .set({ isActive: true, updatedAt: new Date().toISOString() })
          .where(eq(mailConfig.id, id))
      })
    } catch (err) {
      if (isUniqueViolation(err)) {
        return conflict(
          "Another mail config is already active. Reload and retry.",
        )
      }
      throw err
    }

    const [updated] = await db
      .select({
        id: mailConfig.id,
        label: mailConfig.label,
        host: mailConfig.host,
        port: mailConfig.port,
        secure: mailConfig.secure,
        user: mailConfig.user,
        pass: mailConfig.pass,
        fromEmail: mailConfig.fromEmail,
        fromName: mailConfig.fromName,
        isActive: mailConfig.isActive,
        createdAt: mailConfig.createdAt,
        updatedAt: mailConfig.updatedAt,
      })
      .from(mailConfig)
      .where(eq(mailConfig.id, id))
      .limit(1)

    // The overview shows a "mail not configured" warning derived from this
    // table, and SMTP going live or being superseded is exactly when an admin
    // goes looking for it.
    refreshStats(statTag("mail-config"))

    return NextResponse.json(
      updated ? { ...updated, pass: updated.pass ? "••••••••" : "" } : updated,
    )
  },
)
