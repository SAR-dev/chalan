import { type SQL, sql } from "drizzle-orm"
import type { dbRead } from "@/lib/db"
import { sumMoney, sumMoneyFiltered } from "@/lib/db/money-sql"
import { order } from "@/lib/db/schema"

/**
 * Compute a rider's cash summary from the ledger of delivered orders:
 *
 *   totalCollected = Σ amountCollected (all deliveries by the rider)
 *   totalSubmitted  = Σ amountCollected where COD was settled (`codSettledAt`)
 *   cashOnHand      = totalCollected − totalSubmitted
 *
 * `scope` is an optional predicate on the order table so callers can restrict
 * to a single rider (rider cash detail) or run one grouped query for the
 * whole roster (rider cash list).
 */
export async function cashOnHand(
  db: Pick<typeof dbRead, "select">,
  scope: SQL | undefined,
): Promise<{
  totalCollected: number
  totalSubmitted: number
  cashOnHand: number
}> {
  const [row] = await db
    .select({
      totalCollected: sumMoney(order.amountCollected),
      totalSubmitted: sumMoneyFiltered(
        order.amountCollected,
        sql`${order.codSettledAt} is not null`,
      ),
    })
    .from(order)
    .where(scope)

  const totalCollected = row?.totalCollected ?? 0
  const totalSubmitted = row?.totalSubmitted ?? 0
  return {
    totalCollected,
    totalSubmitted,
    cashOnHand: totalCollected - totalSubmitted,
  }
}
