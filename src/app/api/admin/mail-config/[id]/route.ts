import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, notFound } from "@/lib/api-response"
import { db } from "@/lib/db"
import { mailConfig } from "@/lib/db/schema"
import { withErrorHandler } from "@/lib/with-error-handler"

export const DELETE = withErrorHandler(
  async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me || me.role !== "SUPER_ADMIN") return forbidden()

    const { id } = await params

    const [existing] = await db
      .select({ id: mailConfig.id, isActive: mailConfig.isActive })
      .from(mailConfig)
      .where(eq(mailConfig.id, id))
      .limit(1)
    if (!existing) return notFound()

    // Don't allow deleting the active config
    if (existing.isActive) {
      return NextResponse.json(
        { error: "Cannot delete the active config. Activate another first." },
        { status: 400 },
      )
    }

    await db.delete(mailConfig).where(eq(mailConfig.id, id))
    return NextResponse.json({ success: true })
  },
)
