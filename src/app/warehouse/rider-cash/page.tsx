"use client"

import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Loader2,
  Users,
} from "lucide-react"
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
import { useRiderCash } from "@/features/riders/hooks/use-rider-cash"
import { formatTk } from "@/lib/pricing"

export default function WarehouseRiderCashPage() {
  const { riderCash, isLoading, isRefreshing, error } = useRiderCash()

  const totalCashOnHand = riderCash.reduce((sum, r) => sum + r.cashOnHand, 0)
  const totalCollected = riderCash.reduce((sum, r) => sum + r.totalCollected, 0)
  const totalSubmitted = riderCash.reduce((sum, r) => sum + r.totalSubmitted, 0)

  // A refresh must never blank the table. `loading` covers a genuine first load
  // (nothing to show yet) and an in-flight refetch alike, and the two want
  // different affordances: a spinner only while there is genuinely nothing to
  // render, a quiet marker once rows exist. Emptying the list on every fetch
  // reads as "your riders' cash records were deleted".
  const busy = isLoading || isRefreshing
  const showSpinner = busy && !error && riderCash.length === 0
  const showRefreshing = busy && !error && riderCash.length > 0

  return (
    <div className="flex flex-col gap-6">
      <div data-testid="rider-cash-page">
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
              <div
                className="text-2xl font-bold"
                data-testid="rider-cash-total-on-hand"
              >
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
              <div
                className="text-2xl font-bold"
                data-testid="rider-cash-total-collected"
              >
                {formatTk(totalCollected)}
              </div>
              <p className="text-muted-foreground text-xs">
                From all deliveries
              </p>
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
              <div
                className="text-2xl font-bold"
                data-testid="rider-cash-total-submitted"
              >
                {formatTk(totalSubmitted)}
              </div>
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
            {error && riderCash.length === 0 ? (
              <p
                className="text-muted-foreground rounded-lg border px-4 py-8 text-center text-sm"
                data-testid="rider-cash-error"
              >
                Could not load rider cash holdings. Reload to try again.
              </p>
            ) : showSpinner ? (
              <div
                className="flex items-center justify-center py-12"
                data-testid="rider-cash-loading"
              >
                <Loader2 className="text-muted-foreground size-6 animate-spin" />
              </div>
            ) : riderCash.length === 0 ? (
              <p
                className="text-muted-foreground py-8 text-center text-sm"
                data-testid="rider-cash-empty"
              >
                No rider cash data available.
              </p>
            ) : (
              <>
                {showRefreshing ? (
                  <p
                    className="text-muted-foreground mb-3 flex items-center gap-2 text-xs"
                    data-testid="rider-cash-refreshing"
                  >
                    <Loader2 className="size-3 animate-spin" />
                    Refreshing cash holdings…
                  </p>
                ) : null}
                <Table data-testid="rider-cash-table">
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
                    {riderCash.map((rider) => (
                      <TableRow
                        key={rider.riderId}
                        data-testid={`rider-cash-row-${rider.riderId}`}
                      >
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
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
