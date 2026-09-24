import { asc, desc, eq, sql } from "drizzle-orm"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, unauthorized } from "@/lib/api-response"
import { dbRead as db } from "@/lib/db"
import { balanceTransaction, merchantBalance } from "@/lib/db/schema"
import { paginateResponse, parsePagination, parseSort } from "@/lib/pagination"
import { withErrorHandler } from "@/lib/with-error-handler"

export const GET = withErrorHandler(
  async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
    const me = await requireSession()
    if (!me) return unauthorized()

    const { id: merchantId } = await params

    // Merchants can only read their own balance.
    if (me.role === "MERCHANT" && me.merchantId !== merchantId) {
      return forbidden()
    }

    // Everyone else must be SUPER_ADMIN.
    if (me.role !== "MERCHANT" && me.role !== "SUPER_ADMIN") {
      return forbidden()
    }

    const [balanceRow] = await db
      .select({
        id: merchantBalance.id,
        balance: merchantBalance.balance,
        pendingBalance: merchantBalance.pendingBalance,
      })
      .from(merchantBalance)
      .where(eq(merchantBalance.merchantId, merchantId))
      .limit(1)

    // It is valid for a merchant to have no balance row yet (no orders placed).
    const balance = balanceRow?.balance ?? 0

    const { limit, offset } = parsePagination(req)

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(balanceTransaction)
      .where(eq(balanceTransaction.merchantId, merchantId))

    const sortColumnMap = {
      date: balanceTransaction.createdAt,
      amount: balanceTransaction.amount,
      type: balanceTransaction.type,
      status: balanceTransaction.status,
    }
    const sort = parseSort(req, sortColumnMap)

    let q = db
      .select({
        id: balanceTransaction.id,
        merchantId: balanceTransaction.merchantId,
        type: balanceTransaction.type,
        amount: balanceTransaction.amount,
        status: balanceTransaction.status,
        note: balanceTransaction.note,
        paymentMethod: balanceTransaction.paymentMethod,
        paymentAccount: balanceTransaction.paymentAccount,
        reviewedBy: balanceTransaction.reviewedBy,
        reviewedAt: balanceTransaction.reviewedAt,
        rejectReason: balanceTransaction.rejectReason,
        createdAt: balanceTransaction.createdAt,
      })
      .from(balanceTransaction)
      .where(eq(balanceTransaction.merchantId, merchantId))
      .$dynamic()

    if (sort) {
      q =
        sort.direction === "asc"
          ? q.orderBy(asc(sort.column))
          : q.orderBy(desc(sort.column))
    } else {
      q = q.orderBy(desc(balanceTransaction.createdAt))
    }

    if (limit !== undefined) q = q.limit(limit)
    if (offset !== undefined) q = q.offset(offset)

    const transactions = await q

    return NextResponse.json({
      balance,
      ...paginateResponse(transactions, count, limit, offset),
    })
  },
)
