"use client"

import {
  ArrowDownRight,
  Banknote,
  CheckCircle2,
  Clock,
  Loader2,
  Send,
} from "lucide-react"
import { useEffect, useState } from "react"
import { PageHeader } from "@/components/page-header"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { useAuth } from "@/features/account/hooks/use-auth"
import { formatTk } from "@/lib/pricing"

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

interface CashSummary {
  cashOnHand: number
  totalCollected: number
  totalSubmitted: number
}

interface CashTransaction {
  id: string
  riderId: string
  orderId: string
  type: "COLLECTED" | "SUBMITTED" | "CONFIRMED"
  amount: number
  createdAt: string
  confirmedBy: string | null
  confirmedAt: string | null
}

interface CashData {
  cash: CashSummary
  transactions: CashTransaction[]
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
  const { currentUser } = useAuth()
  const [data, setData] = useState<CashData | null>(null)
  const [loading, setLoading] = useState(true)

  const riderId = currentUser?.riderId

  useEffect(() => {
    if (!riderId) return
    setLoading(true)
    fetch(`/api/riders/${riderId}/cash`)
      .then((res) => res.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [riderId])

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

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Earnings"
          description="View your cash collection summary"
        />
        <div className="flex items-center justify-center py-24">
          <Loader2 className="text-muted-foreground size-6 animate-spin" />
        </div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Earnings"
          description="View your cash collection summary"
        />
        <Card>
          <CardContent className="text-muted-foreground py-12 text-center text-sm">
            Failed to load cash data.
          </CardContent>
        </Card>
      </div>
    )
  }

  const { cash, transactions } = data

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Earnings"
        description="View your cash collection summary"
      />

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cash on Hand</CardTitle>
            <Banknote className="text-muted-foreground size-4" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatTk(cash.cashOnHand)}
            </div>
            <p className="text-muted-foreground text-xs">Available to submit</p>
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
            <div className="text-2xl font-bold">
              {formatTk(cash.totalCollected)}
            </div>
            <p className="text-muted-foreground text-xs">From all deliveries</p>
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
            <div className="text-2xl font-bold">
              {formatTk(cash.totalSubmitted)}
            </div>
            <p className="text-muted-foreground text-xs">Handed to warehouse</p>
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
            <p className="text-muted-foreground py-8 text-center text-sm">
              No transactions yet.
            </p>
          ) : (
            <div className="space-y-4">
              {transactions.map((tx) => (
                <div key={tx.id}>
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
    </div>
  )
}
