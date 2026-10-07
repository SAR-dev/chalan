import { desc, isNull } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { db, dbRead } from "@/lib/db"
import { labelTemplate } from "@/lib/db/schema"
import { labelTemplateCreateSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

/**
 * The label designer's data source and draft writer (R5).
 *
 * Three shapes travel through one endpoint:
 * - `draft`     the single editable row (`publishedAt IS NULL`); what the
 *               designer is working on.
 * - `published` the live default template the print path renders.
 * - `versions`  every published row, newest first — the append-only history.
 *
 * Publishing is the only way a row becomes live, and it happens through the
 * `[id]/publish` route, never here: the collection route only ever writes the
 * draft.
 */
export const GET = withErrorHandler(async (_req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") return forbidden()

  const rows = await dbRead
    .select()
    .from(labelTemplate)
    .orderBy(desc(labelTemplate.updatedAt))

  const draft = rows.find((row) => row.publishedAt === null) ?? null
  const versions = rows
    .filter((row) => row.publishedAt !== null)
    .sort((a, b) => (a.publishedAt ?? "").localeCompare(b.publishedAt ?? ""))
    .reverse()

  return NextResponse.json({
    draft,
    published: versions[0] ?? null,
    versions,
  })
})

/**
 * Creates the working draft. There is at most one: the client PATCHes it once
 * it exists, so a second POST would be a race the designer never intends to
 * win — reject it rather than quietly forking a second draft.
 */
export const POST = withErrorHandler(async (req: Request) => {
  const me = await requireSession()
  if (!me) return unauthorized()
  if (me.role !== "SUPER_ADMIN") return forbidden()

  const parsed = await parseBody(req, labelTemplateCreateSchema)
  if (parsed.error) return parsed.error

  const [existing] = await dbRead
    .select({ id: labelTemplate.id })
    .from(labelTemplate)
    .where(isNull(labelTemplate.publishedAt))
    .limit(1)
  if (existing) {
    return NextResponse.json(
      { error: "A draft already exists. Edit it instead of creating another." },
      { status: 409 },
    )
  }

  const [created] = await db
    .insert(labelTemplate)
    .values({
      name: parsed.data.name.trim(),
      widthMm: parsed.data.widthMm,
      heightMm: parsed.data.heightMm,
      logoRef: parsed.data.logoRef ?? null,
      blocks: parsed.data.blocks,
      version: 1,
      publishedAt: null,
      isDefault: false,
    })
    .returning()

  return NextResponse.json(created, { status: 201 })
})
