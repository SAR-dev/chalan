"use client"

import { Banknote, CheckCircle2, Clock, Receipt } from "lucide-react"
import dynamic from "next/dynamic"
import { useState } from "react"
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

// recharts is heavy and this chart only appears once the analytics payload has
// arrived, so it ships as its own chunk rather than in the dashboard's initial
// bundle. Importing the file directly also keeps the barrel's other charts out
// (ROADMAP R5.10). `ssr: false` because there is nothing to draw until the
// client has the data either.
const AreaChart = dynamic(
  () => import("@/components/charts/area-chart").then((m) => m.AreaChart),
  { ssr: false },
)

export default function CodSettlementPage() {
  const [dateFrom, setDateFrom] = useState<string | undefined>(undefined)
  const [dateTo, setDateTo] = useState<string | undefined>(undefined)

  const { analytics, isLoading, isRefreshing } = useOrderAnalytics({
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
            loading={isLoading || isRefreshing}
          />
        </CardContent>
      </Card>
    </div>
  )
}
