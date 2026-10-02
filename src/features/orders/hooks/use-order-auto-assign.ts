"use client"

import { useCallback, useState } from "react"
import { useOrders } from "@/features/orders/hooks/use-orders"
import { groupAssignmentsByRider } from "@/lib/auto-assign"
import { formatError } from "@/lib/validation"

/** One rider's share of a proposed plan. */
export interface AutoAssignAssignment {
  orderId: string
  riderId: string
  riderName: string
  reason: string
}

export interface AutoAssignUnassigned {
  orderId: string
  reason: string
}

export interface AutoAssignRiderLoad {
  riderId: string
  riderName: string
  active: number
  assigned: number
}

export interface AutoAssignPlan {
  assignments: AutoAssignAssignment[]
  unassigned: AutoAssignUnassigned[]
  riderLoads: AutoAssignRiderLoad[]
  eligibleRiderCount: number
}

export interface AutoAssignResult {
  ok: boolean
  /** Riders whose whole batch went through. */
  dispatched: number
  /** Parcels that could not be dispatched, with the reason for each. */
  failures: Array<{ orderId: string; reason: string }>
}

/**
 * Preview-then-apply for spreading a batch across the warehouse's riders.
 *
 * The plan is fetched from the server because load balancing needs the whole
 * roster's committed work, and a warehouse admin's order list is paged — the
 * parcels the client can see are not the parcels the decision is about.
 *
 * Applying it deliberately does not post the plan anywhere new. It calls the
 * existing bulk `dispatch` endpoint once per rider, so the `dispatch`
 * transition validates every parcel, the audit trail reads the same as a
 * manual dispatch, and a suggestion can never write anything a hand-picked
 * dispatch could not.
 */
export function useOrderAutoAssign() {
  const { bulkDispatch } = useOrders()
  const [plan, setPlan] = useState<AutoAssignPlan | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isApplying, setIsApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reset = useCallback(() => {
    setPlan(null)
    setError(null)
    setIsLoading(false)
    setIsApplying(false)
  }, [])

  const preview = useCallback(async (ids: string[]) => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/orders/auto-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        setPlan(null)
        setError(formatError(data, "Could not build a dispatch plan."))
        return null
      }
      setPlan(data as AutoAssignPlan)
      return data as AutoAssignPlan
    } catch {
      setPlan(null)
      setError("Network error. Please try again.")
      return null
    } finally {
      setIsLoading(false)
    }
  }, [])

  const apply = useCallback(
    async (target: AutoAssignPlan): Promise<AutoAssignResult> => {
      const failures: Array<{ orderId: string; reason: string }> = []
      let dispatched = 0
      setIsApplying(true)
      // Sequential on purpose: each call locks its own rows, and firing them
      // together would have several batches racing for the same rider's load.
      for (const group of groupAssignmentsByRider(target)) {
        const res = await bulkDispatch(group.orderIds, group.riderId)
        if (res.ok) {
          dispatched += group.orderIds.length
          continue
        }
        const reason = res.error ?? "Could not dispatch parcels."
        for (const orderId of group.orderIds) failures.push({ orderId, reason })
      }
      setIsApplying(false)
      return { ok: failures.length === 0, dispatched, failures }
    },
    [bulkDispatch],
  )

  return { plan, isLoading, isApplying, error, preview, apply, reset }
}
