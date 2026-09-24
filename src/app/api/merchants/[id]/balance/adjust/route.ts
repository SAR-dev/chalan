import { eq, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { logAudit } from "@/lib/audit"
import { diffEntity } from "@/lib/audit-diff"
import { db } from "@/lib/db"
import { balanceTransaction, merchantBalance } from "@/lib/db/schema"
import { balanceAdjustSchema, parseBody } from "@/lib/validation"
import { withErrorHandler } from "@/lib/with-error-handler"

export const POST = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
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

    const {
      row: inserted,
      before: beforeBalance,
      after: afterBalance,
    } = await db.transaction(async (tx) => {
      const [before] = await tx
        .select({
          balance: merchantBalance.balance,
          pendingBalance: merchantBalance.pendingBalance,
        })
        .from(merchantBalance)
        .where(eq(merchantBalance.merchantId, merchantId))
        .limit(1)

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

      const [after] = await tx
        .select({
          balance: merchantBalance.balance,
          pendingBalance: merchantBalance.pendingBalance,
        })
        .from(merchantBalance)
        .where(eq(merchantBalance.merchantId, merchantId))
        .limit(1)

      return { row, before, after }
    })

    const diff = diffEntity(beforeBalance, afterBalance, [
      "balance",
      "pendingBalance",
    ])

    await logAudit({
      actor: { userId: me.userId, name: me.name, role: me.role },
      action: "BALANCE_ADJUSTED",
      entityType: "balance_transaction",
      entityId: inserted.id,
      description: `Adjusted merchant ${merchantId} balance by ${amount} Tk: ${note.trim()}`,
      metadata: diff ? { diff } : null,
    })

    return NextResponse.json(inserted, { status: 201 })
  },
)
