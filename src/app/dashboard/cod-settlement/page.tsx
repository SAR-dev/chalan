"use client"

import { Banknote, CheckCircle2, Clock, Receipt } from "lucide-react"
import { useState } from "react"
import { AreaChart } from "@/components/charts"
import { DateRangePicker } from "@/components/date-range-picker"
import { PageHeader } from "@/components/page-header"
import { StatCardList } from "@/components/stat-card-list"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useOrderAnalytics } from "@/features/orders/hooks/use-order-analytics"
import { formatTk } from "@/lib/pricing"

export default function CodSettlementPage() {
  const [dateFrom, setDateFrom] = useState<string | undefined>(undefined)
  const [dateTo, setDateTo] = useState<string | undefined>(undefined)

  const { analytics, isLoading } = useOrderAnalytics({
    from: dateFrom,
    to: dateTo,
  })

  const cod = analytics?.codSummary

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="COD Settlement"
        description="Track cash-on-delivery collections and settlements."
      >
        <DateRangePicker
          from={dateFrom}
          to={dateTo}
          onFromChange={setDateFrom}
          onToChange={setDateTo}
        />
      </PageHeader>

      <StatCardList
        columns={4}
        items={[
          {
            label: "Total collected",
            value: formatTk(cod?.totalCollected ?? 0),
            icon: Banknote,
            tone: "success",
          },
          {
            label: "Total settled",
            value: formatTk(cod?.totalSettled ?? 0),
            hint: `${cod?.settledCount ?? 0} orders`,
            icon: CheckCircle2,
            tone: "info",
          },
          {
            label: "Pending settlement",
            value: formatTk(cod?.pendingSettlement ?? 0),
            hint: `${cod?.pendingCount ?? 0} orders`,
            icon: Clock,
            tone: "pending",
          },
          {
            label: "Settlement rate",
            value: `${(cod?.totalCollected ?? 0) > 0 ? Math.round(((cod?.totalSettled ?? 0) / (cod?.totalCollected ?? 1)) * 100) : 0}%`,
            icon: Receipt,
            tone: "info",
          },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>COD collection over time</CardTitle>
          <CardDescription>Daily collection amounts</CardDescription>
        </CardHeader>
        <CardContent>
          <AreaChart
            data={(analytics?.ordersByDay ?? []).map((d) => ({
              label: d.date,
              value: d.revenue,
            }))}
            height={250}
            loading={isLoading}
          />
        </CardContent>
      </Card>
    </div>
  )
}
