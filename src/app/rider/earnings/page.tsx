"use client"

import {
  ArrowDownRight,
  Banknote,
  CheckCircle2,
  Clock,
  Loader2,
  Send,
} from "lucide-react"
import { PageHeader } from "@/components/page-header"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { useRiderEarnings } from "@/features/riders/hooks/use-rider-earnings"
import { formatDateTime } from "@/lib/format"
import { formatTk } from "@/lib/pricing"

function formatDate(dateStr: string) {
  return formatDateTime(dateStr, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function TransactionIcon({ type }: { type: string }) {
  switch (type) {
    case "COLLECTED":
      return <ArrowDownRight className="size-4 text-green-600" />
    case "SUBMITTED":
      return <Send className="size-4 text-blue-600" />
    case "CONFIRMED":
      return <CheckCircle2 className="size-4 text-green-600" />
    default:
      return <Clock className="size-4 text-muted-foreground" />
  }
}

function TransactionLabel({ type }: { type: string }) {
  switch (type) {
    case "COLLECTED":
      return "Collected"
    case "SUBMITTED":
      return "Submitted"
    case "CONFIRMED":
      return "Confirmed"
    default:
      return type
  }
}

export default function RiderEarningsPage() {
  const { riderId, cash, transactions, isLoading, isRefreshing } =
    useRiderEarnings()

  // A refresh must never blank the view. `isLoading` covers only the very first
  // load and `isRefreshing` the in-flight revalidation; while either runs with
  // nothing yet to show, draw the spinner, otherwise keep the summary and the
  // activity list on screen. The old early `return` on local `loading` tore the
  // whole page down on every remount and left a spinner for data the server
  // still had.
  const busy = isLoading || isRefreshing
  const showSpinner = busy && !cash
  const showFailure = !showSpinner && !cash

  if (!riderId) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Earnings"
          description="View your cash collection summary"
        />
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center text-sm">
            No rider account linked to your profile.
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6" data-testid="rider-earnings-page">
      <PageHeader
        title="Earnings"
        description="View your cash collection summary"
      />

      {showSpinner ? (
        <div
          className="flex items-center justify-center py-24"
          data-testid="rider-earnings-loading"
        >
          <Loader2 className="text-muted-foreground size-6 animate-spin" />
        </div>
      ) : showFailure ? (
        <Card>
          <CardContent
            className="text-muted-foreground py-12 text-center text-sm"
            data-testid="rider-earnings-error"
          >
            Failed to load cash data. Reload to try again.
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Cash on Hand
                </CardTitle>
                <Banknote className="text-muted-foreground size-4" />
              </CardHeader>
              <CardContent>
                <div
                  className="text-2xl font-bold"
                  data-testid="rider-earnings-cash-on-hand"
                >
                  {formatTk(cash?.cashOnHand ?? 0)}
                </div>
                <p className="text-muted-foreground text-xs">
                  Available to submit
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Total Collected
                </CardTitle>
                <ArrowDownRight className="text-muted-foreground size-4" />
              </CardHeader>
              <CardContent>
                <div
                  className="text-2xl font-bold"
                  data-testid="rider-earnings-collected"
                >
                  {formatTk(cash?.totalCollected ?? 0)}
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
                <Send className="text-muted-foreground size-4" />
              </CardHeader>
              <CardContent>
                <div
                  className="text-2xl font-bold"
                  data-testid="rider-earnings-submitted"
                >
                  {formatTk(cash?.totalSubmitted ?? 0)}
                </div>
                <p className="text-muted-foreground text-xs">
                  Handed to warehouse
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Your latest cash transactions</CardDescription>
            </CardHeader>
            <CardContent>
              {transactions.length === 0 ? (
                <p
                  className="text-muted-foreground py-8 text-center text-sm"
                  data-testid="rider-earnings-empty"
                >
                  No transactions yet.
                </p>
              ) : (
                <div
                  className="space-y-4"
                  data-testid="rider-earnings-activity"
                >
                  {transactions.map((tx) => (
                    <div key={tx.id} data-testid={`rider-earnings-tx-${tx.id}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <TransactionIcon type={tx.type} />
                          <div>
                            <p className="text-sm font-medium">
                              <TransactionLabel type={tx.type} />
                            </p>
                            <p className="text-muted-foreground text-xs">
                              {formatDate(tx.createdAt)}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`text-sm font-medium tabular-nums ${
                            tx.type === "COLLECTED"
                              ? "text-green-600"
                              : tx.type === "SUBMITTED"
                                ? "text-blue-600"
                                : ""
                          }`}
                        >
                          {tx.type === "COLLECTED" ? "+" : "-"}
                          {formatTk(tx.amount)}
                        </span>
                      </div>
                      <Separator className="mt-4" />
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
