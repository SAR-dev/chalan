"use client"

import { ArrowLeft, Loader2, PackageCheck, Plus, Upload } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { pageContent } from "@/config/content"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import { useOrders } from "@/features/orders/hooks/use-orders"
import { quoteParcel } from "@/features/orders/quote-parcel"
import { usePackages } from "@/features/packages/hooks/use-packages"
import { usePickupLocations } from "@/features/pickup-locations/hooks/use-pickup-locations"
import { useDeliveryCities } from "@/features/platform-config/hooks/use-delivery-cities"
import { useDeliveryZones } from "@/features/platform-config/hooks/use-delivery-zones"
import { useZonePricingPublic } from "@/features/platform-config/hooks/use-zone-pricing-public"
import { pickTierForCount } from "@/lib/packages"
import { pricingUnavailableMessage } from "@/lib/pricing"
import type { CreateOrderInput } from "@/lib/types"
import {
  InactiveAccountCard,
  VerificationCard,
} from "./components/account-alerts"
import { ParcelCard } from "./components/parcel-card"
import type { ParcelState } from "./types"

function emptyParcel(pickupLocationId = ""): ParcelState {
  return {
    id: crypto.randomUUID(),
    pickupLocationId,
    recipientName: "",
    recipientPhone: "",
    deliveryCityId: "",
    deliveryAddress: "",
    parcelWeightKg: "1",
    itemType: "",
    productCost: "",
    deliveryType: "STANDARD",
    deliveryMapLink: "",
    merchantNote: "",
  }
}

export default function NewOrderPage() {
  const router = useRouter()
  const { currentMerchant } = useMerchants()
  const { pickupLocations } = usePickupLocations()
  const { cities: deliveryCities } = useDeliveryCities()
  const { pricing: zonePricing } = useZonePricingPublic()
  // Only used to name the zone pair in the "cannot be priced" message.
  const { zones } = useDeliveryZones()
  const { createOrders } = useOrders()
  const { packages, activePackage } = usePackages()

  // The active bundle's current tier rule, so the per-parcel preview shows the
  // same delivery fee the server will charge. `pickTierForCount` is the same
  // selector order creation uses.
  const packageRule = useMemo(() => {
    if (!activePackage) return null
    const pkg = packages.find((p) => p.id === activePackage.packageId)
    if (!pkg) return null
    return pickTierForCount(pkg.tiers, activePackage.ordersUsed)
  }, [packages, activePackage])

  const myLocations = useMemo(
    () =>
      currentMerchant
        ? pickupLocations.filter((p) => p.merchantId === currentMerchant.id)
        : [],
    [pickupLocations, currentMerchant],
  )

  const [parcels, setParcels] = useState<ParcelState[]>([emptyParcel()])
  const [submitting, setSubmitting] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [apiErrors, setApiErrors] = useState<Record<number, string[]>>({})

  // Prefill every parcel's pickup location once, when the merchant's
  // locations finish loading. Runs a single time so a merchant who clears a
  // select isn't fought by the effect.
  const seededPickup = useRef(false)
  useEffect(() => {
    if (seededPickup.current || myLocations.length === 0) return
    seededPickup.current = true
    setParcels((prev) =>
      prev.map((p) =>
        p.pickupLocationId ? p : { ...p, pickupLocationId: myLocations[0].id },
      ),
    )
  }, [myLocations])

  function updateParcel<K extends keyof ParcelState>(
    id: string,
    key: K,
    value: ParcelState[K],
  ) {
    setParcels((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [key]: value } : p)),
    )
  }

  function addParcel() {
    setParcels((prev) => [
      ...prev,
      emptyParcel(prev[0]?.pickupLocationId ?? myLocations[0]?.id ?? ""),
    ])
  }

  function removeParcel(id: string) {
    setParcels((prev) =>
      prev.length === 1 ? prev : prev.filter((p) => p.id !== id),
    )
  }

  const rows = useMemo(() => {
    return parcels.map((p, index) => {
      const {
        weight,
        productCost,
        breakdown,
        deliveryCharge,
        codFee,
        exceedsMax,
        maxWeightKg,
        pricingUnavailable,
        pricingUnavailableReason,
        fromZone,
        toZone,
      } = quoteParcel({
        pickupLocationId: p.pickupLocationId,
        deliveryCityId: p.deliveryCityId,
        parcelWeightKg: p.parcelWeightKg,
        productCost: p.productCost,
        pickupLocations,
        deliveryCities,
        zonePricing,
        zones,
        packageRule,
      })

      const errors: string[] = []
      if (submitAttempted) {
        if (!p.pickupLocationId) errors.push("Pickup location is required.")
        if (!p.recipientName.trim()) errors.push("Recipient name is required.")
        if (!p.recipientPhone.trim())
          errors.push("Recipient phone is required.")
        if (!p.deliveryCityId.trim()) errors.push("Delivery city is required.")
        if (!p.deliveryAddress.trim())
          errors.push("Delivery address is required.")
        if (weight <= 0) errors.push("Weight must be greater than 0.")
        if (exceedsMax) errors.push(`Exceeds ${maxWeightKg} KG max.`)
      }
      if (apiErrors[index]) {
        errors.push(...apiErrors[index])
      }

      return {
        parcel: p,
        weight,
        productCost,
        breakdown,
        deliveryCharge,
        codFee,
        exceedsMax,
        maxWeightKg,
        errors,
        pricingUnavailable,
        pricingError: pricingUnavailableReason
          ? pricingUnavailableMessage(
              pricingUnavailableReason,
              fromZone,
              toZone,
            )
          : null,
      }
    })
  }, [
    parcels,
    currentMerchant,
    submitAttempted,
    apiErrors,
    pickupLocations,
    deliveryCities,
    zonePricing,
    zones,
  ])

  const anyExceeds = rows.some((r) => r.exceedsMax)
  // A lane with no configured rate cannot be priced at all — the server rejects
  // it, so block here rather than round-tripping for a 400.
  const anyUnpriced = rows.some((r) => r.pricingUnavailable)

  if (!currentMerchant) return null

  const notActive = currentMerchant.status !== "ACTIVE"

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitAttempted(true)

    const hasErrors = parcels.some((p, i) => {
      // Unpriced lane, or over the route's own weight limit — either way the
      // server would reject it, so don't bother submitting.
      if (rows[i]?.pricingUnavailable || rows[i]?.exceedsMax) return true
      const weight = Number(p.parcelWeightKg) || 0
      return (
        !p.pickupLocationId ||
        !p.recipientName.trim() ||
        !p.recipientPhone.trim() ||
        !p.deliveryCityId.trim() ||
        !p.deliveryAddress.trim() ||
        weight <= 0
      )
    })
    if (hasErrors) return

    const payload: CreateOrderInput[] = parcels.map((p) => ({
      pickupLocationId: p.pickupLocationId,
      recipientName: p.recipientName.trim(),
      recipientPhone: p.recipientPhone.trim(),
      deliveryCityId: p.deliveryCityId.trim(),
      deliveryAddress: p.deliveryAddress.trim(),
      deliveryMapLink: p.deliveryMapLink.trim() || null,
      parcelWeightKg: Number(p.parcelWeightKg) || 0,
      // Blank becomes null, not "". The two are indistinguishable in the UI but
      // not in the database, and "did not say" is worth being able to tell apart
      // from "typed nothing useful" if the field is ever grouped.
      itemType: p.itemType.trim() || null,
      deliveryType: p.deliveryType,
      productCost: Number(p.productCost) || 0,
      merchantNote: p.merchantNote.trim() || null,
    }))

    setSubmitting(true)
    setApiErrors({})
    // try/finally: a thrown fetch (offline, gateway error) must not leave the
    // submit button disabled forever.
    try {
      const result = await createOrders(payload)
      if (result.ok && result.orders) {
        toast.success(
          `${result.orders.length} order${result.orders.length > 1 ? "s" : ""} created.`,
        )
        router.push("/merchant/orders")
        return
      }
      if (result.issues) {
        const mapped: Record<number, string[]> = {}
        for (const issue of result.issues) {
          if (issue.path[0] === "orders" && typeof issue.path[1] === "number") {
            const idx = issue.path[1]
            mapped[idx] = mapped[idx] ?? []
            mapped[idx].push(issue.message)
          }
        }
        setApiErrors(mapped)
      } else {
        toast.error(result.error ?? "Unable to create orders.")
      }
    } catch {
      toast.error("Could not reach the server. Please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <PageHeader
        title={pageContent.merchant.newOrder.title}
        description={pageContent.merchant.newOrder.description}
      >
        <Button
          variant="outline"
          render={<Link href="/merchant/orders" />}
          nativeButton={false}
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <Button
          variant="outline"
          render={<Link href="/merchant/orders/import" />}
          nativeButton={false}
          data-testid="bulk-import-open"
        >
          <Upload className="size-4" />
          Import CSV
        </Button>
      </PageHeader>

      {notActive ? (
        <InactiveAccountCard merchant={currentMerchant} />
      ) : !currentMerchant.emailVerifiedAt || !currentMerchant.nidVerifiedAt ? (
        <VerificationCard merchant={currentMerchant} />
      ) : (
        <div className="flex flex-col gap-6">
          <form
            id="order-form"
            onSubmit={handleSubmit}
            className="flex flex-col gap-6"
          >
            {rows.map((row, index) => (
              <ParcelCard
                key={row.parcel.id}
                row={row}
                index={index}
                parcelCount={parcels.length}
                deliveryCities={deliveryCities}
                myLocations={myLocations}
                updateParcel={updateParcel}
                removeParcel={removeParcel}
              />
            ))}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button type="button" variant="outline" onClick={addParcel}>
                <Plus className="size-4" />
                Add another parcel
              </Button>
              <Button
                type="submit"
                data-testid="submit-order"
                className="gap-2"
                disabled={submitting || anyExceeds || anyUnpriced}
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <PackageCheck className="size-4" />
                )}
                Confirm {parcels.length} order
                {parcels.length > 1 ? "s" : ""}
              </Button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
