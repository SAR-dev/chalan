import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { unauthorized } from "@/lib/api-response"
import { db } from "@/lib/db"
import { merchant } from "@/lib/db/schema"
import { withErrorHandler } from "@/lib/with-error-handler"

export const PATCH = withErrorHandler(async () => {
  const me = await requireSession()
  if (!me || me.role !== "MERCHANT" || !me.merchantId) return unauthorized()

  await db
    .update(merchant)
    .set({ onboardingCompletedAt: new Date().toISOString() })
    .where(eq(merchant.id, me.merchantId))

  return NextResponse.json({ ok: true })
})
