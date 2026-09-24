"use client"

import {
  AlertTriangle,
  ArrowLeft,
  Calculator,
  ChevronDown,
  ChevronUp,
  Loader2,
  MapPin,
  PackageCheck,
  Plus,
  Trash2,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { toast } from "sonner"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { pageContent } from "@/config/content"
import { useMerchants } from "@/features/merchants/hooks/use-merchants"
import { useOrders } from "@/features/orders/hooks/use-orders"
import { usePickupLocations } from "@/features/pickup-locations/hooks/use-pickup-locations"
import { useDeliveryCities } from "@/features/platform-config/hooks/use-delivery-cities"
import { useZonePricingPublic } from "@/features/platform-config/hooks/use-zone-pricing-public"
import { ORDER_DELIVERY_TYPE_LABELS } from "@/lib/constants"
import { calcCodFee, calcDeliveryCharge, formatTk } from "@/lib/pricing"
import type { CreateOrderInput, DeliveryType } from "@/lib/types"

interface ParcelState {
  id: string
  recipientName: string
  recipientPhone: string
  deliveryCityId: string
  deliveryAddress: string
  parcelWeightKg: string
  productCost: string
  deliveryType: DeliveryType
  deliveryMapLink: string
  merchantNote: string
}

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
      </PageHeader>

      {notActive ? (
        <Card className="border-chart-3/30 bg-chart-3/5">
          <CardContent className="flex items-start gap-3 p-5">
            <AlertTriangle className="text-chart-3 mt-0.5 size-5 shrink-0" />
            <p className="text-muted-foreground text-sm leading-relaxed">
              Your account is{" "}
              <span className="text-foreground font-medium">
                {currentMerchant.status}
              </span>
              . Orders can only be created once your account is active.
            </p>
          </CardContent>
        </Card>
      ) : !currentMerchant.emailVerifiedAt || !currentMerchant.nidVerifiedAt ? (
        <Card className="border-chart-3/30 bg-chart-3/5">
          <CardContent className="flex items-start gap-3 p-5">
            <AlertTriangle className="text-chart-3 mt-0.5 size-5 shrink-0" />
            <div className="flex flex-col gap-2">
              <p className="text-foreground font-medium">
                Verification Required
              </p>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Your account requires verification before you can place orders.
              </p>
              <ul className="text-muted-foreground mt-2 space-y-1 text-sm">
                <li className="flex items-center gap-2">
                  {currentMerchant.emailVerifiedAt ? (
                    <span className="text-green-600">✓</span>
                  ) : (
                    <span className="text-chart-3">○</span>
                  )}
                  Email verified
                  {!currentMerchant.emailVerifiedAt && (
                    <span className="text-muted-foreground">— Pending</span>
                  )}
                </li>
                <li className="flex items-center gap-2">
                  {currentMerchant.nidVerifiedAt ? (
                    <span className="text-green-600">✓</span>
                  ) : currentMerchant.nidSubmittedAt ? (
                    <span className="text-chart-3">◐</span>
                  ) : (
                    <span className="text-chart-3">○</span>
                  )}
                  NID verified
                  {currentMerchant.nidVerifiedAt ? (
                    ""
                  ) : currentMerchant.nidSubmittedAt ? (
                    <span className="text-muted-foreground">
                      — Under review
                    </span>
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
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="flex flex-col gap-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="size-4" />
                  Pickup location
                </CardTitle>
                <CardDescription>
                  All parcels in this batch are collected from this location.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="pickup">Location</Label>
                  <Select
                    value={pickupLocationId}
                    onValueChange={(v) => setPickupLocationId(v ?? "")}
                  >
                    <SelectTrigger id="pickup" className="w-full sm:min-w-64">
                      <SelectValue placeholder="Select a pickup location">
                        {(value) => {
                          const loc = myLocations.find((l) => l.id === value)
                          return loc ? loc.label : "Select a pickup location"
                        }}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      {myLocations.map((loc) => (
                        <SelectItem key={loc.id} value={loc.id}>
                          {loc.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            <form
              id="order-form"
              onSubmit={handleSubmit}
              className="flex flex-col gap-6"
            >
              {rows.map((row, index) => {
                const p = row.parcel
                return (
                  <Card key={p.id}>
                    <CardHeader className="space-y-0 [.border-b]:pb-(--card-spacing)">
                      <div>
                        <CardTitle className="text-base">
                          Parcel {index + 1}
                        </CardTitle>
                        <CardDescription>
                          {row.exceedsMax ? (
                            <span className="text-destructive">
                              exceeds {currentMerchant.maxWeightKg} KG limit
                            </span>
                          ) : (
                            <span>
                              {row.productCost > 0 && (
                                <>COD {formatTk(row.productCost)} · </>
                              )}
                              {row.codFee > 0 && (
                                <>COD Charge {formatTk(row.codFee)} · </>
                              )}
                              Delivery Charge {formatTk(row.deliveryCharge)}
                              {row.isZonePricing && (
                                <span className="text-muted-foreground ml-1 text-xs">
                                  (zone rate)
                                </span>
                              )}
                            </span>
                          )}
                        </CardDescription>
                      </div>
                      {parcels.length > 1 && (
                        <div data-slot="card-action">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => removeParcel(p.id)}
                            aria-label={`Remove parcel ${index + 1}`}
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="flex flex-col gap-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="flex flex-col gap-2">
                            <Label htmlFor={`name-${p.id}`}>
                              Recipient name
                            </Label>
                            <Input
                              id={`name-${p.id}`}
                              value={p.recipientName}
                              onChange={(e) =>
                                updateParcel(
                                  p.id,
                                  "recipientName",
                                  e.target.value,
                                )
                              }
                              placeholder="Sumaiya Islam"
                              required
                            />
                          </div>
                          <div className="flex flex-col gap-2">
                            <Label htmlFor={`phone-${p.id}`}>
                              Recipient phone
                            </Label>
                            <Input
                              id={`phone-${p.id}`}
                              type="tel"
                              value={p.recipientPhone}
                              onChange={(e) =>
                                updateParcel(
                                  p.id,
                                  "recipientPhone",
                                  e.target.value,
                                )
                              }
                              placeholder="+8801811112233"
                              required
                            />
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          <Label htmlFor={`city-${p.id}`}>Delivery city</Label>
                          <Select
                            value={p.deliveryCityId}
                            onValueChange={(v) => {
                              updateParcel(p.id, "deliveryCityId", v ?? "")
                            }}
                          >
                            <SelectTrigger id={`city-${p.id}`}>
                              <SelectValue placeholder="Select city" />
                            </SelectTrigger>
                            <SelectContent>
                              {deliveryCities.map((c) => (
                                <SelectItem key={c.id} value={c.id}>
                                  {c.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="flex flex-col gap-2">
                          <Label htmlFor={`address-${p.id}`}>
                            Delivery address
                          </Label>
                          <Input
                            id={`address-${p.id}`}
                            value={p.deliveryAddress}
                            onChange={(e) =>
                              updateParcel(
                                p.id,
                                "deliveryAddress",
                                e.target.value,
                              )
                            }
                            placeholder="Flat B2, Road 11, Banani"
                            required
                          />
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="flex flex-col gap-2">
                            <Label htmlFor={`weight-${p.id}`}>
                              Parcel weight (KG)
                            </Label>
                            <Input
                              id={`weight-${p.id}`}
                              type="text"
                              inputMode="decimal"
                              pattern="[0-9]*\.?[0-9]*"
                              value={p.parcelWeightKg}
                              onChange={(e) =>
                                updateParcel(
                                  p.id,
                                  "parcelWeightKg",
                                  e.target.value,
                                )
                              }
                              required
                            />
                          </div>
                          <div className="flex flex-col gap-2">
                            <Label htmlFor={`cost-${p.id}`}>
                              COD amount (TK)
                            </Label>
                            <Input
                              id={`cost-${p.id}`}
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              value={p.productCost}
                              onChange={(e) =>
                                updateParcel(
                                  p.id,
                                  "productCost",
                                  e.target.value,
                                )
                              }
                              placeholder="5000"
                              required
                            />
                          </div>
                        </div>

                        <div className="flex flex-col gap-2">
                          <Label htmlFor={`delivery-type-${p.id}`}>
                            Delivery type
                          </Label>
                          <Select
                            value={p.deliveryType}
                            onValueChange={(v) =>
                              updateParcel(
                                p.id,
                                "deliveryType",
                                (v ?? "STANDARD") as DeliveryType,
                              )
                            }
                          >
                            <SelectTrigger
                              id={`delivery-type-${p.id}`}
                              className="w-full sm:min-w-40"
                            >
                              <SelectValue placeholder="Select delivery type">
                                {ORDER_DELIVERY_TYPE_LABELS[p.deliveryType]}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {(
                                Object.entries(ORDER_DELIVERY_TYPE_LABELS) as [
                                  DeliveryType,
                                  string,
                                ][]
                              ).map(([value, label]) => (
                                <SelectItem key={value} value={value}>
                                  {label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {showOptional.has(p.id) ? (
                          <>
                            <div className="flex flex-col gap-2">
                              <Label htmlFor={`map-${p.id}`}>
                                Delivery map link (optional)
                              </Label>
                              <Input
                                id={`map-${p.id}`}
                                type="url"
                                value={p.deliveryMapLink}
                                onChange={(e) =>
                                  updateParcel(
                                    p.id,
                                    "deliveryMapLink",
                                    e.target.value,
                                  )
                                }
                                placeholder="https://maps.google.com/..."
                              />
                            </div>

                            <div className="flex flex-col gap-2">
                              <Label htmlFor={`note-${p.id}`}>
                                Note (optional)
                              </Label>
                              <Input
                                id={`note-${p.id}`}
                                value={p.merchantNote}
                                onChange={(e) =>
                                  updateParcel(
                                    p.id,
                                    "merchantNote",
                                    e.target.value,
                                  )
                                }
                                placeholder="e.g. Handle with care"
                                maxLength={100}
                              />
                            </div>
                          </>
                        ) : null}

                        <button
                          type="button"
                          onClick={() =>
                            setShowOptional((prev) => {
                              const next = new Set(prev)
                              if (next.has(p.id)) next.delete(p.id)
                              else next.add(p.id)
                              return next
                            })
                          }
                          className="text-muted-foreground hover:text-foreground flex items-center gap-1 self-start text-xs"
                        >
                          {showOptional.has(p.id) ? (
                            <>
                              <ChevronUp className="size-3" />
                              Fewer options
                            </>
                          ) : (
                            <>
                              <ChevronDown className="size-3" />
                              More options
                            </>
                          )}
                        </button>

                        {row.errors.length > 0 && (
                          <div className="bg-destructive/10 text-destructive flex flex-col gap-1 rounded-md px-3 py-2 text-xs">
                            {row.errors.map((err) => (
                              <span key={err}>{err}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
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
            <Card className="sticky top-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calculator className="size-4" />
                  Batch summary
                </CardTitle>
                <CardDescription>
                  {parcels.length} parcel{parcels.length > 1 ? "s" : ""}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {anyExceeds && (
                  <div className="bg-destructive/10 text-destructive mb-4 flex items-start gap-2 rounded-md px-3 py-3 text-sm">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                    <span>
                      Some parcels exceed the {currentMerchant.maxWeightKg} KG
                      maximum. Fix them before submitting.
                    </span>
                  </div>
                )}
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Total COD</dt>
                    <dd className="font-medium tabular-nums">
                      {formatTk(totals.productCost)}
                    </dd>
                  </div>
                  {totals.codFee > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">
                        Total COD Charge
                      </dt>
                      <dd className="font-medium tabular-nums">
                        {formatTk(totals.codFee)}
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">
                      Total Delivery Charge
                    </dt>
                    <dd className="font-medium tabular-nums">
                      {formatTk(totals.deliveryCharge)}
                    </dd>
                  </div>
                </dl>
                <p className="text-muted-foreground mt-3 text-center text-xs">
                  Cash collected from recipient on delivery. Delivery fees are
                  charged to your platform balance.
                </p>
              </CardContent>
              <CardFooter>
                <Button
                  type="submit"
                  form="order-form"
                  className="w-full"
                  disabled={submitting || anyExceeds}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Creating
                    </>
                  ) : (
                    <>
                      <PackageCheck className="size-4" />
                      Confirm {parcels.length} order
                      {parcels.length > 1 ? "s" : ""}
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>
          </div>
        </div>
      )}
    </>
  )
}
