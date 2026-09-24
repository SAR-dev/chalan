"use client"

import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Loader2,
  Users,
} from "lucide-react"
import { useEffect, useState } from "react"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatTk } from "@/lib/pricing"

interface RiderCashData {
  riderId: string
  riderName: string
  cashOnHand: number
  totalCollected: number
  totalSubmitted: number
}

export default function WarehouseRiderCashPage() {
  const [cashData, setCashData] = useState<RiderCashData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/riders/cash")
      .then((res) => (res.ok ? (res.json() as Promise<RiderCashData[]>) : []))
      .then(setCashData)
      .catch(() => setCashData([]))
      .finally(() => setLoading(false))
  }, [])

  const totalCashOnHand = cashData.reduce((sum, r) => sum + r.cashOnHand, 0)
  const totalCollected = cashData.reduce((sum, r) => sum + r.totalCollected, 0)
  const totalSubmitted = cashData.reduce((sum, r) => sum + r.totalSubmitted, 0)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Rider Cash Holdings"
        description="Track cash collected by riders in your warehouse"
      />

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Cash on Hand
            </CardTitle>
            <Banknote className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatTk(totalCashOnHand)}
            </div>
            <p className="text-muted-foreground text-xs">Across all riders</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Collected
            </CardTitle>
            <AlertTriangle className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatTk(totalCollected)}</div>
            <p className="text-muted-foreground text-xs">From all deliveries</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Submitted
            </CardTitle>
            <CheckCircle2 className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatTk(totalSubmitted)}</div>
            <p className="text-muted-foreground text-xs">
              Received from riders
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4" />
            Rider Holdings
          </CardTitle>
          <CardDescription>
            Cash on hand for each rider in your warehouse
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="text-muted-foreground size-6 animate-spin" />
            </div>
          ) : cashData.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              No rider cash data available.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rider</TableHead>
                  <TableHead className="text-right">Cash on Hand</TableHead>
                  <TableHead className="text-right">Collected</TableHead>
                  <TableHead className="text-right">Submitted</TableHead>
                  <TableHead className="text-right">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cashData.map((rider) => (
                  <TableRow key={rider.riderId}>
                    <TableCell className="font-medium">
                      {rider.riderName}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTk(rider.cashOnHand)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTk(rider.totalCollected)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatTk(rider.totalSubmitted)}
                    </TableCell>
                    <TableCell className="text-right">
                      {rider.cashOnHand > 5000 ? (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="size-3" />
                          High
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1">
                          <CheckCircle2 className="size-3" />
                          Normal
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
