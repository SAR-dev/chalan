import { sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { db } from "@/lib/db"
import { balanceTransaction, merchantBalance } from "@/lib/db/schema"
import { balanceAdjustSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const POST = withErrorHandler(async (

  req: Request,
  { params }: { params: Promise<{ id: string }> },

) => {
  const me = await requireSession()
  if (!me) return unauthorized()

  // Adjustment is SUPER_ADMIN only.
  if (me.role !== "SUPER_ADMIN") {
    return forbidden()
  }

  const { id: merchantId } = await params

  const parsed = await parseBody(req, balanceAdjustSchema)
  if (parsed.error) return parsed.error
  const { amount, note } = parsed.data

  const [inserted] = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(balanceTransaction)
      .values({
        merchantId,
        type: "ADJUSTMENT",
        amount, // positive = charge, negative = credit; caller decides
        status: "SETTLED",
        note: note.trim(),
        createdBy: me.name,
      })
      .returning()

    await tx
      .insert(merchantBalance)
      .values({ merchantId, balance: amount })
      .onConflictDoUpdate({
        target: merchantBalance.merchantId,
        set: {
          balance: sql`${merchantBalance.balance} + ${amount}`,
          updatedAt: new Date().toISOString(),
        },
      })

    return [row]
  })

  await logAudit({
    actor: { userId: me.userId, name: me.name, role: me.role },
    action: "BALANCE_ADJUSTED",
    entityType: "balance_transaction",
    entityId: inserted.id,
    description: `Adjusted merchant ${merchantId} balance by ${amount} Tk: ${note.trim()}`,
  })

  return NextResponse.json(inserted, { status: 201 })
})

