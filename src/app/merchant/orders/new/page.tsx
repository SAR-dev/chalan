"use client"

import { ArrowLeft, Loader2, PackageCheck, Plus, Upload } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { FormErrors } from "@/components/form-errors"
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
import { isValidEmail } from "@/lib/validation"
import {
  InactiveAccountCard,
  VerificationCard,
} from "./components/account-alerts"
import { ParcelCard } from "./components/parcel-card"
import type { ParcelField, ParcelState, ParcelValidation } from "./types"

function emptyParcel(pickupLocationId = ""): ParcelState {
  return {
    id: crypto.randomUUID(),
    pickupLocationId,
    recipientName: "",
    recipientPhone: "",
    recipientMail: "",
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
  // Snapshots taken on submit, keyed by parcel id — see `ParcelValidation` for
  // why this is not recomputed while the merchant types.
  const [validation, setValidation] = useState<
    Record<string, ParcelValidation>
  >({})
  const [serverErrors, setServerErrors] = useState<Record<string, string[]>>({})

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
    // The removed parcel's messages would otherwise outlive it in the summary.
    setValidation((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
    setServerErrors((prev) => {
      if (!(id in prev)) return prev
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  /**
   * The form-level summary: every message from the last submit, in one list the
   * merchant hears once instead of hunting for across N cards. Prefixed with the
   * parcel only when there is more than one, because "Parcel 1: " on a
   * single-parcel form is noise.
   */
  const summaryErrors = useMemo(() => {
    const summary: Record<string, string> = {}
    const many = parcels.length > 1
    parcels.forEach((p, i) => {
      const prefix = many ? `Parcel ${i + 1}: ` : ""
      for (const [field, message] of Object.entries(validation[p.id] ?? {})) {
        summary[`${i}-${field}`] = `${prefix}${message}`
      }
    })
    return summary
  }, [parcels, validation])

  const rows = useMemo(() => {
    return parcels.map((p) => {
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

      // Deliberately no field validation here — see `ParcelValidation`. This
      // memo answers "what does this parcel cost, and what did the server say
      // about it", and nothing else.
      //
      // A parcel with no pickup or no destination city has not been asked a
      // pricing question yet — `quoteParcel` reports those as "cannot price"
      // because it cannot, which is a different statement from "this lane has
      // no rate". Treating the two the same left a blank form showing a red
      // pricing error and a submit button disabled for no reason.
      const priced = Boolean(p.pickupLocationId) && Boolean(p.deliveryCityId)
      return {
        parcel: p,
        weight,
        productCost,
        breakdown,
        deliveryCharge,
        codFee,
        exceedsMax,
        maxWeightKg,
        errors: serverErrors[p.id] ?? [],
        pricingUnavailable: priced && pricingUnavailable,
        pricingError:
          priced && pricingUnavailable && pricingUnavailableReason
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
    serverErrors,
    pickupLocations,
    deliveryCities,
    zonePricing,
    zones,
    packageRule,
  ])

  const anyExceeds = rows.some((r) => r.exceedsMax)
  // A lane with no configured rate cannot be priced at all — the server rejects
  // it, so block here rather than round-tripping for a 400.
  const anyUnpriced = rows.some((r) => r.pricingUnavailable)
  // A disabled button with no explanation is a dead end: say what to fix.
  const blockedReason = anyUnpriced
    ? "A parcel's route has no delivery rate configured yet, so it cannot be priced."
    : anyExceeds
      ? "A parcel is over its route's weight limit."
      : null

  if (!currentMerchant) return null

  const notActive = currentMerchant.status !== "ACTIVE"

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // Stale from the previous attempt: whatever the server said last time is
    // no longer what matters.
    setServerErrors({})

    // Validate once, here, and keep the result until the next submit — see
    // `ParcelValidation` for why these messages are not derived while typing.
    const next: Record<string, ParcelValidation> = {}
    let blocked = false
    parcels.forEach((p, i) => {
      const fieldErrors: Partial<Record<ParcelField, string>> = {}
      const need = (field: ParcelField, label: string, value: string) => {
        if (value.trim()) return
        fieldErrors[field] = `${label} is required.`
        blocked = true
      }
      need("pickupLocationId", "Pickup location", p.pickupLocationId)
      need("recipientName", "Recipient name", p.recipientName)
      need("recipientPhone", "Recipient phone", p.recipientPhone)
      need("deliveryCityId", "Delivery city", p.deliveryCityId)
      need("deliveryAddress", "Delivery address", p.deliveryAddress)

      // Optional by design, so there is deliberately no `need()` here — but a
      // typo still has to fail on this side. Reaching the server with one turns
      // into a 400 that discards every other field typed on the card, which is
      // a much worse way to learn the same thing.
      const mail = p.recipientMail.trim()
      if (mail && !isValidEmail(mail)) {
        fieldErrors.recipientMail =
          "Recipient email must be a valid email address."
        blocked = true
      }

      if ((Number(p.parcelWeightKg) || 0) <= 0) {
        fieldErrors.parcelWeightKg = "Weight must be greater than 0."
        blocked = true
      }

      // Unpriced lane or over the route's own weight limit — either way the
      // server would reject it, so don't round-trip for a 400. Neither is a
      // control's fault: the card header already names the lane or the limit.
      if (rows[i]?.pricingUnavailable || rows[i]?.exceedsMax) blocked = true

      next[p.id] = fieldErrors
    })
    if (blocked) {
      setValidation(next)
      return
    }
    setValidation({})

    const payload: CreateOrderInput[] = parcels.map((p) => ({
      pickupLocationId: p.pickupLocationId,
      recipientName: p.recipientName.trim(),
      recipientPhone: p.recipientPhone.trim(),
      // Blank becomes null, not "" — same reasoning as itemType below.
      recipientMail: p.recipientMail.trim() || null,
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
        // Keyed by parcel id, not by the index the server sent back: parcels
        // can be removed between the render and the response.
        const mapped: Record<string, string[]> = {}
        for (const issue of result.issues) {
          if (issue.path[0] === "orders" && typeof issue.path[1] === "number") {
            const parcel = parcels[issue.path[1]]
            if (!parcel) continue
            mapped[parcel.id] = mapped[parcel.id] ?? []
            mapped[parcel.id].push(issue.message)
          }
        }
        setServerErrors(mapped)
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
            <FormErrors
              errors={
                Object.keys(summaryErrors).length > 0 ? summaryErrors : null
              }
            />

            {rows.map((row, index) => (
              <ParcelCard
                key={row.parcel.id}
                row={row}
                index={index}
                parcelCount={parcels.length}
                deliveryCities={deliveryCities}
                myLocations={myLocations}
                validation={validation[row.parcel.id] ?? null}
                updateParcel={updateParcel}
                removeParcel={removeParcel}
              />
            ))}

            <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={addParcel}
                data-testid="add-parcel"
              >
                <Plus className="size-4" />
                Add another parcel
              </Button>
              <div className="flex flex-col gap-2 sm:items-end">
                {blockedReason ? (
                  <p
                    data-testid="submit-blocked-reason"
                    className="text-muted-foreground text-sm sm:text-right"
                  >
                    {blockedReason}
                  </p>
                ) : null}
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
            </div>
          </form>
        </div>
      )}
    </>
  )
}
