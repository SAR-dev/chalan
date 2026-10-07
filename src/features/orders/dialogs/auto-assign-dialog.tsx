"use client"

import { Route, Sparkles, TriangleAlert } from "lucide-react"
import { useEffect, useMemo } from "react"
import { FormDialog } from "@/components/form-dialog"
import { Badge } from "@/components/ui/badge"
import { useOrderAutoAssign } from "@/features/orders/hooks/use-order-auto-assign"
import { groupAssignmentsByRider } from "@/lib/auto-assign"
import { toast } from "@/lib/notify"

/**
 * One rider's block in the plan.
 *
 * The reason is shown once rather than per parcel: a batch handed to one rider
 * almost always shares one reason, and repeating it per row buries the thing
 * that actually matters — how the work split across riders.
 */
function RiderBlock({
  riderId,
  riderName,
  orderIds,
  reason,
  active,
  assigned,
}: {
  riderId: string
  riderName: string
  orderIds: string[]
  reason: string
  active: number
  assigned: number
}) {
  return (
    <div
      data-testid={`auto-assign-rider-${riderId}`}
      className="border-border space-y-1.5 rounded-lg border p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{riderName}</p>
        <Badge
          variant="secondary"
          data-testid={`auto-assign-rider-${riderId}-count`}
        >
          {assigned} {assigned === 1 ? "parcel" : "parcels"}
        </Badge>
      </div>
      <p className="text-muted-foreground text-xs">
        {active} already in hand → {active + assigned} after this dispatch.
      </p>
      <p className="text-muted-foreground text-xs">{reason}</p>
      <p className="text-muted-foreground font-mono text-xs">
        {orderIds.join(", ")}
      </p>
    </div>
  )
}

export function AutoAssignDialog({
  ids,
  open,
  onOpenChange,
  onComplete,
}: {
  ids: string[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: () => void
}) {
  const { plan, isLoading, isApplying, error, preview, apply, reset } =
    useOrderAutoAssign()

  // Rebuild the plan each time the dialog opens. A cached one would be a lie by
  // the time it was confirmed — another admin may have dispatched some of these
  // parcels, or a rider may have finished a run, since it was fetched.
  const idsKey = ids.join(",")
  useEffect(() => {
    if (!open || ids.length === 0) {
      reset()
      return
    }
    preview(ids)
    // `ids` is a fresh array on every parent render; its contents are what
    // matter and they are captured by `idsKey`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, idsKey, preview, reset])

  // The plan groups assignments by rider for display; the reason for a group is
  // whichever of its assignments carries it (they agree within a group, except
  // that a group spanning a tie-break can mix "fewest" and "tied" wording — in
  // which case the first is representative enough to show).
  const groups = useMemo(() => {
    if (!plan) return []
    return groupAssignmentsByRider(plan).map((group) => ({
      ...group,
      reason: plan.assignments.find((a) => a.riderId === group.riderId)?.reason,
      load: plan.riderLoads.find((l) => l.riderId === group.riderId),
    }))
  }, [plan])

  async function handleConfirm() {
    if (!plan) return
    const result = await apply(plan)
    // Partial success is normal here — one stale parcel fails and the rest go.
    // Reporting the whole batch as failed would send a dispatcher hunting for a
    // problem that is already half-solved.
    if (result.dispatched > 0) {
      toast.success(
        `${result.dispatched} of ${result.dispatched + result.failures.length} dispatched.`,
      )
      onComplete()
    }
    if (!result.ok) {
      toast.error(
        `${result.failures.length} left behind: ${result.failures[0]?.reason ?? "Dispatch failed."}`,
      )
    }
    if (result.ok || result.dispatched > 0) onOpenChange(false)
  }

  const dispatched = plan?.assignments.length ?? 0

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Spread across your delivery riders"
      description={`Suggested riders for ${ids.length} selected ${ids.length === 1 ? "parcel" : "parcels"} — the rider carrying the fewest parcels wins, and every choice is explained below.`}
      size="lg"
      onConfirm={handleConfirm}
      submitting={isApplying || isLoading}
      submittingLabel="Dispatching"
      submitLabel={`Dispatch ${dispatched} ${dispatched === 1 ? "parcel" : "parcels"}`}
      submitIcon={<Route className="size-4" />}
      submitDisabled={!plan || dispatched === 0}
      submitTestId="auto-assign-confirm"
    >
      {isLoading && !plan ? (
        <div
          data-testid="auto-assign-loading"
          className="border-border text-muted-foreground rounded-md border border-dashed px-3 py-6 text-center text-sm"
        >
          <Sparkles className="mx-auto mb-2 size-5" />
          Balancing {ids.length} against every rider&apos;s current load…
        </div>
      ) : error ? (
        <div
          data-testid="auto-assign-error"
          className="border-destructive/40 bg-destructive/5 text-destructive flex items-start gap-2 rounded-md border px-3 py-3 text-sm"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : !plan ? (
        <p className="text-muted-foreground text-sm">Nothing to plan.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.length === 0 ? (
            <p
              data-testid="auto-assign-empty"
              className="border-border text-muted-foreground rounded-md border border-dashed px-3 py-4 text-sm"
            >
              No parcel in this selection can be dispatched yet.
            </p>
          ) : (
            groups.map((group) => (
              <RiderBlock
                key={group.riderId}
                riderId={group.riderId}
                riderName={group.riderName}
                orderIds={group.orderIds}
                reason={group.reason ?? ""}
                active={group.load?.active ?? 0}
                assigned={group.load?.assigned ?? group.orderIds.length}
              />
            ))
          )}

          {plan.unassigned.length > 0 && (
            <div
              data-testid="auto-assign-unassigned"
              className="border-border bg-muted/40 space-y-1 rounded-lg border p-3"
            >
              <p className="text-sm font-medium">
                {plan.unassigned.length} left out
              </p>
              <ul className="text-muted-foreground space-y-0.5 text-xs">
                {plan.unassigned.map((u) => (
                  <li key={u.orderId} className="font-mono">
                    {u.orderId} — {u.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-muted-foreground text-xs">
            Nothing is sent until you confirm, and you can still assign riders
            by hand for any parcel afterwards.
          </p>
        </div>
      )}
    </FormDialog>
  )
}
