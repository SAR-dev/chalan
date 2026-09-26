"use client"

import { ArrowLeft, Plus, Upload } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { pageContent } from "@/config/content"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import { useOrders } from "@/features/orders/hooks/use-orders"
import { usePickupLocations } from "@/features/pickup-locations/hooks/use-pickup-locations"
import { useDeliveryCities } from "@/features/platform-config/hooks/use-delivery-cities"
import { useZonePricingPublic } from "@/features/platform-config/hooks/use-zone-pricing-public"
import { calcCodFee, calcDeliveryCharge } from "@/lib/pricing"
import type { CreateOrderInput } from "@/lib/types"
import {
  InactiveAccountCard,
  VerificationCard,
} from "./components/account-alerts"
import { BatchSummaryCard } from "./components/batch-summary-card"
import { ParcelCard } from "./components/parcel-card"
import { PickupLocationCard } from "./components/pickup-location-card"
import type { ParcelState } from "./types"

function emptyParcel(): ParcelState {
  return {
    id: crypto.randomUUID(),
    recipientName: "",
    recipientPhone: "",
    deliveryCityId: "",
    deliveryAddress: "",
    parcelWeightKg: "1",
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
  const { createOrders } = useOrders()

  const myLocations = useMemo(
    () =>
      currentMerchant
        ? pickupLocations.filter((p) => p.merchantId === currentMerchant.id)
        : [],
    [pickupLocations, currentMerchant],
  )

  const [pickupLocationId, setPickupLocationId] = useState("")
  const [parcels, setParcels] = useState<ParcelState[]>([emptyParcel()])
  const [submitting, setSubmitting] = useState(false)
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [apiErrors, setApiErrors] = useState<Record<number, string[]>>({})
  const [showOptional, setShowOptional] = useState<Set<string>>(new Set())

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
    setParcels((prev) => [...prev, emptyParcel()])
  }

  function removeParcel(id: string) {
    setParcels((prev) =>
      prev.length === 1 ? prev : prev.filter((p) => p.id !== id),
    )
  }

  const rows = useMemo(() => {
    // Resolve origin zone from selected pickup location
    const pickupLoc = pickupLocations.find((l) => l.id === pickupLocationId)
    const originCity = deliveryCities.find((c) => c.id === pickupLoc?.cityId)
    const originZoneId = originCity?.zoneId ?? null

    return parcels.map((p, index) => {
      const weight = Number(p.parcelWeightKg) || 0
      const productCost = Number(p.productCost) || 0

      // Zone pricing: try to find pricing from origin zone to destination zone
      const destCity = deliveryCities.find((c) => c.id === p.deliveryCityId)
      const destZoneId = destCity?.zoneId ?? null
      const zonePrice =
        originZoneId && destZoneId
          ? zonePricing.find(
              (z) => z.fromZoneId === originZoneId && z.toZoneId === destZoneId,
            )
          : null

      // Use zone pricing if available, otherwise fall back to merchant pricing
      const pricing = zonePrice ?? currentMerchant
      const breakdown = pricing ? calcDeliveryCharge(pricing, weight) : null
      const exceedsMax = breakdown?.exceedsMax ?? false
      const codFeePercentage = zonePrice
        ? (zonePrice.codFeePercentage ?? currentMerchant?.codFeePercentage ?? 1)
        : (currentMerchant?.codFeePercentage ?? 1)
      const codFee = currentMerchant
        ? calcCodFee(productCost, codFeePercentage)
        : 0

      const errors: string[] = []
      if (submitAttempted) {
        if (!p.recipientName.trim()) errors.push("Recipient name is required.")
        if (!p.recipientPhone.trim())
          errors.push("Recipient phone is required.")
        if (!p.deliveryCityId.trim()) errors.push("Delivery city is required.")
        if (!p.deliveryAddress.trim())
          errors.push("Delivery address is required.")
        if (weight <= 0) errors.push("Weight must be greater than 0.")
        if (exceedsMax)
          errors.push(`Exceeds ${currentMerchant!.maxWeightKg} KG max.`)
      }
      if (apiErrors[index]) {
        errors.push(...apiErrors[index])
      }

      return {
        parcel: p,
        weight,
        productCost,
        breakdown,
        deliveryCharge: breakdown?.total ?? 0,
        codFee,
        exceedsMax,
        errors,
        isZonePricing: !!zonePrice,
      }
    })
  }, [
    parcels,
    currentMerchant,
    submitAttempted,
    apiErrors,
    pickupLocationId,
    pickupLocations,
    deliveryCities,
    zonePricing,
  ])

  const anyExceeds = rows.some((r) => r.exceedsMax)
  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, r) => ({
          productCost: acc.productCost + r.productCost,
          deliveryCharge: acc.deliveryCharge + r.deliveryCharge,
          codFee: acc.codFee + r.codFee,
        }),
        {
          productCost: 0,
          deliveryCharge: 0,
          codFee: 0,
        },
      ),
    [rows],
  )

  if (!currentMerchant) return null

  const notActive = currentMerchant.status !== "ACTIVE"

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitAttempted(true)
    if (!pickupLocationId) {
      toast.error("Select a pickup location.")
      return
    }

    const hasErrors = parcels.some((p) => {
      const weight = Number(p.parcelWeightKg) || 0
      return (
        !p.recipientName.trim() ||
        !p.recipientPhone.trim() ||
        !p.deliveryCityId.trim() ||
        !p.deliveryAddress.trim() ||
        weight <= 0 ||
        (currentMerchant && weight > currentMerchant.maxWeightKg)
      )
    })
    if (hasErrors) return

    const payload: CreateOrderInput[] = parcels.map((p) => ({
      pickupLocationId,
      recipientName: p.recipientName.trim(),
      recipientPhone: p.recipientPhone.trim(),
      deliveryCityId: p.deliveryCityId.trim(),
      deliveryAddress: p.deliveryAddress.trim(),
      deliveryMapLink: p.deliveryMapLink.trim() || null,
      parcelWeightKg: Number(p.parcelWeightKg) || 0,
      deliveryType: p.deliveryType,
      productCost: Number(p.productCost) || 0,
      merchantNote: p.merchantNote.trim() || null,
    }))

    setSubmitting(true)
    setApiErrors({})
    const result = await createOrders(payload)
    if (result.ok && result.orders) {
      toast.success(
        `${result.orders.length} order${result.orders.length > 1 ? "s" : ""} created.`,
      )
      router.push("/merchant/orders")
    } else {
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
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
            <PickupLocationCard
              myLocations={myLocations}
              pickupLocationId={pickupLocationId}
              setPickupLocationId={setPickupLocationId}
            />

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
                  maxWeightKg={currentMerchant.maxWeightKg}
                  deliveryCities={deliveryCities}
                  showOptional={showOptional}
                  setShowOptional={setShowOptional}
                  updateParcel={updateParcel}
                  removeParcel={removeParcel}
                />
              ))}
            </form>

            <Button
              type="button"
              variant="outline"
              onClick={addParcel}
              className="self-start"
            >
              <Plus className="size-4" />
              Add another parcel
            </Button>
          </div>

          <div className="lg:col-span-1">
            <BatchSummaryCard
              parcelCount={parcels.length}
              anyExceeds={anyExceeds}
              maxWeightKg={currentMerchant.maxWeightKg}
              totals={totals}
              submitting={submitting}
            />
          </div>
        </div>
      )}
    </>
  )
}
