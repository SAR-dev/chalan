import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, notFound, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db, dbRead } from "@/lib/db"
import { labelTemplate } from "@/lib/db/schema"
import { labelTemplateUpdateSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

type Ctx = { params: Promise<{ id: string }> }

/** One version (draft or published) by id — used by the designer's history. */
export const GET = withErrorHandler(async (_req: Request, { params }: Ctx) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") return forbidden()

  const { id } = await params
  const [row] = await dbRead
    .select()
    .from(labelTemplate)
    .where(eq(labelTemplate.id, id))
    .limit(1)
  if (!row) return notFound()

  return NextResponse.json(row)
})

/**
 * Saves edits to the working draft. Published rows are immutable — editing one
 * in place would make a reprint of an earlier label unreproducible, which is
 * the whole reason publishing appends a new version.
 */
export const PATCH = withErrorHandler(async (req: Request, { params }: Ctx) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") return forbidden()

  const { id } = await params
  const [existing] = await dbRead
    .select()
    .from(labelTemplate)
    .where(eq(labelTemplate.id, id))
    .limit(1)
  if (!existing) return notFound()
  if (existing.publishedAt !== null) {
    return NextResponse.json(
      { error: "Published templates cannot be edited. Publish a new draft." },
      { status: 409 },
    )
  }

  const parsed = await parseBody(req, labelTemplateUpdateSchema)
  if (parsed.error) return parsed.error

  const [updated] = await db
    .update(labelTemplate)
    .set({
      ...(parsed.data.name !== undefined
        ? { name: parsed.data.name.trim() }
        : {}),
      ...(parsed.data.widthMm !== undefined
        ? { widthMm: parsed.data.widthMm }
        : {}),
      ...(parsed.data.heightMm !== undefined
        ? { heightMm: parsed.data.heightMm }
        : {}),
      ...(parsed.data.logoRef !== undefined
        ? { logoRef: parsed.data.logoRef ?? null }
        : {}),
      ...(parsed.data.blocks !== undefined
        ? { blocks: parsed.data.blocks }
        : {}),
      updatedAt: new Date().toISOString(),
    })
    .where(eq(labelTemplate.id, id))
    .returning()

  return NextResponse.json(updated)
})

/** Discards the draft. Published versions are kept — history is append-only. */
export const DELETE = withErrorHandler(
  async (_req: Request, { params }: Ctx) => {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (me.role !== "SUPER_ADMIN") return forbidden()

    const { id } = await params
    const [existing] = await dbRead
      .select()
      .from(labelTemplate)
      .where(eq(labelTemplate.id, id))
      .limit(1)
    if (!existing) return notFound()
    if (existing.publishedAt !== null) {
      return NextResponse.json(
        { error: "Published templates cannot be deleted." },
        { status: 409 },
      )
    }

    await db.delete(labelTemplate).where(eq(labelTemplate.id, id))
    await logAudit({
      actor: me,
      action: "LABEL_TEMPLATE_DRAFT_DISCARDED",
      entityType: "label_template",
      entityId: id,
      description: `Discarded label draft "${existing.name}"`,
    })

    return NextResponse.json({ ok: true })
  },
)
