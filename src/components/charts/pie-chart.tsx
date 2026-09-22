"use client"

import {
  Cell,
  Legend,
  Pie,
  PieChart as RechartsPie,
  ResponsiveContainer,
  Tooltip,
} from "recharts"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

const DEFAULT_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
  "var(--muted-foreground)",
]

interface DataPoint {
  name: string
  value: number
  color?: string
}

interface PieChartProps {
  data: DataPoint[]
  height?: number
  loading?: boolean
  className?: string
  innerRadius?: number
  outerRadius?: number
  showLegend?: boolean
}

export function PieChart({
  data,
  height = 200,
  loading,
  className,
  innerRadius = 50,
  outerRadius = 80,
  showLegend = true,
}: PieChartProps) {
  if (loading) {
    return (
      <div
        className={cn("flex items-center justify-center", className)}
        style={{ height }}
      >
        <Skeleton className="size-32 rounded-full" />
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
        <RechartsPie margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell
                key={entry.name}
                fill={
                  entry.color ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length]
                }
              />
            ))}
          </Pie>
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
          {showLegend ? (
            <Legend
              wrapperStyle={{ fontSize: 11 }}
              formatter={(value: string) => (
                <span className="text-muted-foreground">{value}</span>
              )}
            />
          ) : null}
        </RechartsPie>
      </ResponsiveContainer>
    </div>
  )
}
