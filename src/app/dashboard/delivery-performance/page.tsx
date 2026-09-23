"use client"

import { useState } from "react"
import { AreaChart, BarChart, PieChart } from "@/components/charts"
import { DateRangePicker } from "@/components/date-range-picker"
import { PageHeader } from "@/components/page-header"
import { StatCardList } from "@/components/stat-card-list"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useOrderAnalytics } from "@/features/orders/hooks/use-order-analytics"
import { CheckCircle2, Clock, RotateCcw, XCircle } from "lucide-react"

export default function DeliveryPerformancePage() {
  const [dateFrom, setDateFrom] = useState<string | undefined>(undefined)
  const [dateTo, setDateTo] = useState<string | undefined>(undefined)

  const { analytics, isLoading } = useOrderAnalytics({
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
              loading={isLoading}
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
              loading={isLoading}
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
            loading={isLoading}
          />
        </CardContent>
      </Card>
    </div>
  )
}
