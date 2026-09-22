"use client"

import {
  Area,
  CartesianGrid,
  AreaChart as RechartsArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface AreaChartProps {
  data: Record<string, string | number>[]
  dataKey?: string
  xKey?: string
  color?: string
  height?: number
  loading?: boolean
  className?: string
}

export function AreaChart({
  data,
  dataKey = "value",
  xKey = "label",
  color = "var(--color-chart-1)",
  height = 200,
  loading,
  className,
}: AreaChartProps) {
  if (loading) {
    const skeletonHeights = [45, 65, 35, 80, 55, 70, 40, 85, 50, 60, 75, 30]
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

  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RechartsArea
          data={data}
          margin={{ top: 5, right: 5, bottom: 5, left: 5 }}
        >
          <defs>
            <linearGradient
              id={`gradient-${dataKey}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
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
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            fill={`url(#gradient-${dataKey})`}
            strokeWidth={2}
          />
        </RechartsArea>
      </ResponsiveContainer>
    </div>
  )
}
