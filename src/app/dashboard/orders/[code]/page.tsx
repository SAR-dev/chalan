import { eq } from "drizzle-orm"
import { notFound, redirect } from "next/navigation"
import { OrderDetailView } from "@/features/orders/components/order-detail-view"
import { requireSession } from "@/lib/api-auth"
import { dbRead } from "@/lib/db"
import { order, rider, warehouse } from "@/lib/db/schema"

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ code: string }>
}) {
  const me = await requireSession()
  if (!me) redirect("/login")

  const { code } = await params

  const [foundOrder] = await dbRead
    .select()
    .from(order)
    .where(eq(order.id, code))
    .limit(1)

  if (!foundOrder) notFound()

  const [riders, warehouses] = await Promise.all([
    dbRead.select().from(rider),
    dbRead.select().from(warehouse),
  ])

  return (
    <OrderDetailView
      backHref="/dashboard/orders"
      initialOrder={foundOrder}
      initialRiders={riders}
      initialWarehouses={warehouses}
    />
  )
}
