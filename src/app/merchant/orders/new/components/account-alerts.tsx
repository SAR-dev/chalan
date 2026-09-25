"use client"

import { AlertTriangle } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import type { Merchant } from "@/lib/types"

interface AccountAlertsProps {
  merchant: Merchant
}

export function InactiveAccountCard({ merchant }: AccountAlertsProps) {
  return (
    <Card className="border-chart-3/30 bg-chart-3/5">
      <CardContent className="flex items-start gap-3 p-5">
        <AlertTriangle className="text-chart-3 mt-0.5 size-5 shrink-0" />
        <p className="text-muted-foreground text-sm leading-relaxed">
          Your account is{" "}
          <span className="text-foreground font-medium">{merchant.status}</span>
          . Orders can only be created once your account is active.
        </p>
      </CardContent>
    </Card>
  )
}

export function VerificationCard({ merchant }: AccountAlertsProps) {
  return (
    <Card className="border-chart-3/30 bg-chart-3/5">
      <CardContent className="flex items-start gap-3 p-5">
        <AlertTriangle className="text-chart-3 mt-0.5 size-5 shrink-0" />
        <div className="flex flex-col gap-2">
          <p className="text-foreground font-medium">Verification Required</p>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Your account requires verification before you can place orders.
          </p>
          <ul className="text-muted-foreground mt-2 space-y-1 text-sm">
            <li className="flex items-center gap-2">
              {merchant.emailVerifiedAt ? (
                <span className="text-green-600">✓</span>
              ) : (
                <span className="text-chart-3">○</span>
              )}
              Email verified
              {!merchant.emailVerifiedAt && (
                <span className="text-muted-foreground">— Pending</span>
              )}
            </li>
            <li className="flex items-center gap-2">
              {merchant.nidVerifiedAt ? (
                <span className="text-green-600">✓</span>
              ) : merchant.nidSubmittedAt ? (
                <span className="text-chart-3">◐</span>
              ) : (
                <span className="text-chart-3">○</span>
              )}
              NID verified
              {merchant.nidVerifiedAt ? (
                ""
              ) : merchant.nidSubmittedAt ? (
                <span className="text-muted-foreground">— Under review</span>
              ) : (
                <span className="text-muted-foreground">
                  —{" "}
                  <a href="/merchant/verify-nid" className="underline">
                    Upload NID
                  </a>
                </span>
              )}
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
