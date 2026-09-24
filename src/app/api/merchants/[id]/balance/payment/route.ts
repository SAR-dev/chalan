import { and, eq, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { conflict, forbidden, unauthorized } from "@/lib/api-response"
import { db } from "@/lib/db"
import { balanceTransaction, merchantBalance } from "@/lib/db/schema"
import { rateLimitByIp } from "@/lib/rate-limit"
import { balancePaymentSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const POST = withErrorHandler(async (

  req: Request,
  { params }: { params: Promise<{ id: string }> },

) => {
  const me = await requireSession()
  if (!me) return unauthorized()

  const { id: merchantId } = await params

  // Only the merchant themselves can submit a payment.
  if (me.role !== "MERCHANT" || me.merchantId !== merchantId) {
    return forbidden()
  }

  const limited = await rateLimitByIp(req, "balance-payment", 5, 60)
  if (limited) return limited

  // Block submission if a PENDING payment already exists.
  const [existing] = await db
    .select({ id: balanceTransaction.id })
    .from(balanceTransaction)
    .where(
      and(
        eq(balanceTransaction.merchantId, merchantId),
        eq(balanceTransaction.type, "PAYMENT_PENDING"),
        eq(balanceTransaction.status, "PENDING"),
      ),
    )
    .limit(1)

  if (existing) {
    return conflict(
      "You already have a payment awaiting confirmation. Wait for an admin to review it before submitting another.",
    )
  }

  const parsed = await parseBody(req, balancePaymentSchema)
  if (parsed.error) return parsed.error
  const { amount, paymentMethod, paymentAccount, note } = parsed.data

  // Insert as PENDING — balance is NOT touched yet.
  const [inserted] = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(balanceTransaction)
      .values({
        merchantId,
        type: "PAYMENT_PENDING",
        amount: -amount, // negative = will reduce balance when confirmed
        status: "PENDING",
        paymentMethod,
        paymentAccount,
        note: note?.trim() || null,
        createdBy: me.name,
      })
      .returning()

    // Track pending amount so the merchants list doesn't need a correlated subquery.
    await tx
      .insert(merchantBalance)
      .values({ merchantId, pendingBalance: amount })
      .onConflictDoUpdate({
        target: merchantBalance.merchantId,
        set: {
          pendingBalance: sql`${merchantBalance.pendingBalance} + ${amount}`,
          updatedAt: new Date().toISOString(),
        },
      })

    return [row]
  })

  return NextResponse.json(inserted, { status: 201 })
})

