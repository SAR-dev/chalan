"use client"

import {
  Bar,
  CartesianGrid,
  BarChart as RechartsBar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface BarChartProps {
  data: Record<string, string | number>[]
  dataKey?: string
  xKey?: string
  color?: string
  height?: number
  loading?: boolean
  className?: string
  layout?: "horizontal" | "vertical"
}

export function BarChart({
  data,
  dataKey = "value",
  xKey = "label",
  color = "var(--color-chart-1)",
  height = 200,
  loading,
  className,
  layout = "vertical",
}: BarChartProps) {
  if (loading) {
    const skeletonHeights = [60, 85, 45, 70, 55, 80]
    return (
      <div className={cn("flex items-end gap-1", className)} style={{ height }}>
        {skeletonHeights.map((h, i) => (
          <Skeleton key={i} className="flex-1" style={{ height: `${h}%` }} />
        ))}
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div
        className={cn(
          "text-muted-foreground flex items-center justify-center text-sm",
          className,
        )}
        style={{ height }}
      >
        No data available
      </div>
    )
  }

  const isHorizontal = layout === "horizontal"

  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsBar
          data={data}
          layout={isHorizontal ? "vertical" : "horizontal"}
          margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
          {isHorizontal ? (
            <>
              <YAxis
                dataKey={xKey}
                type="category"
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
                tickLine={false}
                axisLine={false}
              />
              <XAxis
                type="number"
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
                tickLine={false}
                axisLine={false}
              />
            </>
          ) : (
            <>
              <XAxis
                dataKey={xKey}
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                className="text-muted-foreground"
                tickLine={false}
                axisLine={false}
              />
            </>
          )}
          <Tooltip
            contentStyle={{
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--border)",
              background: "var(--popover)",
              color: "var(--popover-foreground)",
              fontSize: 13,
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            }}
          />
          <Bar dataKey={dataKey} fill={color} radius={[3, 3, 0, 0]} />
        </RechartsBar>
      </ResponsiveContainer>
    </div>
  )
}
