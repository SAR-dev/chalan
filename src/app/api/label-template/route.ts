import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { dbRead } from "@/lib/db"
import { labelTemplate } from "@/lib/db/schema"
import { withErrorHandler } from "@/lib/with-error-handler"

/**
 * The published parcel-label template (R5), read by every print surface.
 *
 * Deliberately unauthenticated: the quick-print action runs for warehouse
 * admins and riders, and a label's block layout carries no personal data (the
 * per-parcel values arrive from the order at print time). Returns `null` when
 * no template has been published yet, which the client renders as the built-in
 * `DEFAULT_LABEL_TEMPLATE`.
 */
export const GET = withErrorHandler(async () => {
  const [published] = await dbRead
    .select({
      name: labelTemplate.name,
      widthMm: labelTemplate.widthMm,
      heightMm: labelTemplate.heightMm,
      logoRef: labelTemplate.logoRef,
      blocks: labelTemplate.blocks,
      engine: labelTemplate.engine,
      template: labelTemplate.template,
      version: labelTemplate.version,
    })
    .from(labelTemplate)
    .where(eq(labelTemplate.isDefault, true))
    .limit(1)

  return NextResponse.json(published ?? null)
})
