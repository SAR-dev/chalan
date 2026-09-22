import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, notFound } from "@/lib/api-response"
import { db } from "@/lib/db"
import { mailConfig } from "@/lib/db/schema"

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  // Deactivate all configs, then activate the selected one
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

  return NextResponse.json(updated)
}
