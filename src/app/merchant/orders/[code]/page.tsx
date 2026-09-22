"use client"

import { OrderDetailView } from "@/features/orders/components/order-detail-view"
import { useOrders } from "@/features/orders/hooks/use-orders"

export default function MerchantOrderDetailPage() {
  const { updateMerchantNote } = useOrders()
  return (
    <OrderDetailView
      backHref="/merchant/orders"
      onUpdateMerchantNote={updateMerchantNote}
    />
  )
}
