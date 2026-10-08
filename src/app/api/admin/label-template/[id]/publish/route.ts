import { eq, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, notFound, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db, dbRead } from "@/lib/db"
import { labelTemplate } from "@/lib/db/schema"
import { validatePdfmeTemplate } from "@/lib/label/template-schema-guard"
import { withErrorHandler } from "@/lib/with-error-handler"

type Ctx = { params: Promise<{ id: string }> }

/**
 * Publishes the working draft (R5).
 *
 * Publishing appends a *new* immutable row rather than flipping the draft live:
 * the draft stays editable, and every label a parcel was printed with can be
 * reproduced from the version it came from. The new row becomes the platform
 * default; every prior default is cleared in the same transaction so the
 * partial unique index never sees two.
 */
export const POST = withErrorHandler(async (_req: Request, { params }: Ctx) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") return forbidden()

  const { id } = await params
  const [draft] = await dbRead
    .select()
    .from(labelTemplate)
    .where(eq(labelTemplate.id, id))
    .limit(1)
  if (!draft) return notFound()
  if (draft.publishedAt !== null) {
    return NextResponse.json(
      { error: "This template has already been published." },
      { status: 409 },
    )
  }
  // Publishing is the last gate (PDF.md §5): re-validate a pdfme template so a
  // draft that slipped in before the rules (or via a direct DB write) can never
  // become the live label the print path generates from.
  if (draft.engine === "pdfme") {
    if (!draft.template || !validatePdfmeTemplate(draft.template as never)) {
      return NextResponse.json(
        {
          error: "The pdfme template is invalid. Fix it in the designer first.",
        },
        { status: 400 },
      )
    }
  } else if (!draft.blocks || draft.blocks.length === 0) {
    return NextResponse.json(
      { error: "The draft has no blocks to publish." },
      { status: 400 },
    )
  }

  const [maxRow] = await dbRead
    .select({
      max: sql<number>`coalesce(max(${labelTemplate.version}), 0)::int`,
    })
    .from(labelTemplate)
  const nextVersion = (maxRow?.max ?? 0) + 1

  const published = await db.transaction(async (tx) => {
    // Clear the current default first: the partial unique index allows only one
    // `isDefault = true` row, so the insert would fail against the old one.
    await tx
      .update(labelTemplate)
      .set({ isDefault: false })
      .where(eq(labelTemplate.isDefault, true))

    const [created] = await tx
      .insert(labelTemplate)
      .values({
        name: draft.name,
        widthMm: draft.widthMm,
        heightMm: draft.heightMm,
        logoRef: draft.logoRef,
        blocks: draft.blocks,
        engine: draft.engine,
        template: draft.template,
        version: nextVersion,
        publishedAt: new Date().toISOString(),
        isDefault: true,
      })
      .returning()

    await logAudit(
      {
        actor: me,
        action: "LABEL_TEMPLATE_PUBLISHED",
        entityType: "label_template",
        entityId: created?.id ?? id,
        description: `Published label template "${draft.name}" (v${nextVersion})`,
      },
      tx,
    )

    return created
  })

  return NextResponse.json(published, { status: 201 })
})
