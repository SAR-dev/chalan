"use client"

import { CheckCircle2, Clock, RotateCcw, XCircle } from "lucide-react"
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

// recharts is heavy and these three only appear once the analytics payload has
// arrived, so each ships as its own chunk rather than in the dashboard's
// initial bundle. Importing the files directly also keeps the barrel's unused
// charts out (ROADMAP R5.10). `ssr: false` because there is nothing to draw
// until the client has the data either.
const AreaChart = dynamic(
  () => import("@/components/charts/area-chart").then((m) => m.AreaChart),
  { ssr: false },
)
const BarChart = dynamic(
  () => import("@/components/charts/bar-chart").then((m) => m.BarChart),
  { ssr: false },
)
const PieChart = dynamic(
  () => import("@/components/charts/pie-chart").then((m) => m.PieChart),
  { ssr: false },
)

export default function DeliveryPerformancePage() {
  const [dateFrom, setDateFrom] = useState<string | undefined>(undefined)
  const [dateTo, setDateTo] = useState<string | undefined>(undefined)

  const { analytics, isLoading, isRefreshing } = useOrderAnalytics({
    from: dateFrom,
    to: dateTo,
  })

  const dp = analytics?.deliveryPerformance

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Delivery Performance"
        description="Track delivery success rates and performance metrics."
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
            label: "Delivered",
            value: dp?.totalDelivered ?? 0,
            icon: CheckCircle2,
            tone: "success",
          },
          {
            label: "Failed attempts",
            value: dp?.totalFailed ?? 0,
            icon: XCircle,
            tone: "danger",
          },
          {
            label: "Returned",
            value: dp?.totalReturned ?? 0,
            icon: RotateCcw,
            tone: "pending",
          },
          {
            label: "Avg delivery time",
            value: `${dp?.avgDeliveryTimeHours ?? 0}h`,
            hint: `${dp?.successRate ?? 0}% success rate`,
            icon: Clock,
            tone: "info",
          },
        ]}
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Deliveries over time</CardTitle>
            <CardDescription>Daily delivery volume</CardDescription>
          </CardHeader>
          <CardContent>
            <AreaChart
              data={(analytics?.ordersByDay ?? []).map((d) => ({
                label: d.date,
                value: d.count,
              }))}
              height={250}
              loading={isLoading || isRefreshing}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Delivery outcomes</CardTitle>
            <CardDescription>Success vs failure vs return</CardDescription>
          </CardHeader>
          <CardContent>
            <PieChart
              data={[
                { name: "Delivered", value: dp?.totalDelivered ?? 0 },
                { name: "Failed", value: dp?.totalFailed ?? 0 },
                { name: "Returned", value: dp?.totalReturned ?? 0 },
              ].filter((d) => d.value > 0)}
              height={250}
              loading={isLoading || isRefreshing}
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Revenue over time</CardTitle>
          <CardDescription>Daily merchant earnings</CardDescription>
        </CardHeader>
        <CardContent>
          <BarChart
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
