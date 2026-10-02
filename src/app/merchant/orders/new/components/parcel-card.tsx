"use client"

import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
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
import type { DeliveryCityOption } from "@/features/platform-config/hooks/use-delivery-cities"
import { ORDER_DELIVERY_TYPE_LABELS } from "@/lib/constants"
import { formatTk } from "@/lib/pricing"
import type { DeliveryType } from "@/lib/types"
import { cn } from "@/lib/utils"
import type {
  ParcelField,
  ParcelRow,
  ParcelState,
  ParcelValidation,
} from "../types"

interface ParcelCardProps {
  row: ParcelRow
  index: number
  parcelCount: number
  deliveryCities: DeliveryCityOption[]
  myLocations: Array<{ id: string; label: string }>
  /**
   * The last submitted state of this parcel. Absent when the caller has no
   * per-field validation to show — the CSV import preview renders this card
   * too, and its row-level problems arrive in `row.errors` instead. Nothing is
   * flagged before the first attempt: an empty form on load should not look
   * broken.
   */
  validation?: ParcelValidation | null
  updateParcel: <K extends keyof ParcelState>(
    id: string,
    key: K,
    value: ParcelState[K],
  ) => void
  removeParcel: (id: string) => void
}

/**
 * Groups a field as label + control + hint, the way every other form in the
 * app lays one out.
 *
 * `Input` renders its own message when given `error`, because that also wires
 * `aria-invalid`/`aria-describedby` — so `hint` is for explanatory text and
 * `error` here is only for controls that have no such prop (`Select`).
 */
function Field({
  label,
  htmlFor,
  hint,
  error,
  className,
  children,
}: {
  label: string
  htmlFor: string
  hint?: string
  error?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? (
        <span className="text-muted-foreground text-xs">{hint}</span>
      ) : null}
      {error ? (
        <p className="text-destructive text-xs" data-slot="field-error">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function ParcelCard({
  row,
  index,
  parcelCount,
  deliveryCities,
  myLocations,
  validation,
  updateParcel,
  removeParcel,
}: ParcelCardProps) {
  const p = row.parcel
  // Both ends of the lane are known, so there is something to price.
  const canPrice = Boolean(p.pickupLocationId && p.deliveryCityId)
  const fieldError = (field: ParcelField) => validation?.[field]

  return (
    <Card data-testid="parcel-card">
      <CardHeader className="space-y-0 [.border-b]:pb-(--card-spacing)">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <CardTitle className="text-base">Parcel {index + 1}</CardTitle>
          <CardDescription className="text-right">
            {/* Nothing to quote until both ends of the lane exist: showing
                "Delivery Charge TK 0" or a pricing error before the merchant
                has picked a city says something that is not true yet. */}
            {!canPrice ? null : row.pricingUnavailable ? (
              <span
                className="text-destructive"
                data-testid="parcel-pricing-unavailable"
              >
                {row.pricingError}
              </span>
            ) : row.exceedsMax ? (
              <span className="text-destructive">
                exceeds {row.maxWeightKg} KG limit
              </span>
            ) : (
              <span className="text-chart-1">
                {row.codFee > 0 && <>COD Charge {formatTk(row.codFee)} · </>}
                Delivery Charge {formatTk(row.deliveryCharge)}
              </span>
            )}
          </CardDescription>
        </div>
        {parcelCount > 1 && (
          <div data-slot="card-action">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => removeParcel(p.id)}
              aria-label={`Remove parcel ${index + 1}`}
              // 1-based, matching "Parcel {n}" and the aria-label — a test
              // reading the card header should not have to guess the offset.
              data-testid={`remove-parcel-${index + 1}`}
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-5">
          {/*
            Pickup leads, and every other section follows the order a merchant
            fills the form in: who it goes to, where, what is in it, then what
            it is worth. The lane is decided by the pickup location, so putting
            it first means the fee in the header is right before anything else
            is typed.
          */}
          <fieldset className="flex flex-col gap-4">
            <legend className="text-sm font-medium">Pickup</legend>
            <Field
              label="Pickup location"
              htmlFor={`pickup-${p.id}`}
              error={fieldError("pickupLocationId")}
              className="sm:max-w-lg"
            >
              <Select
                value={p.pickupLocationId}
                onValueChange={(v) =>
                  updateParcel(p.id, "pickupLocationId", v ?? "")
                }
              >
                <SelectTrigger
                  id={`pickup-${p.id}`}
                  data-testid="pickup-location"
                  className="w-full"
                >
                  <SelectValue placeholder="Select pickup location">
                    {(value) => {
                      const loc = myLocations.find((l) => l.id === value)
                      return loc ? loc.label : "Select pickup location"
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
            </Field>
          </fieldset>

          <fieldset className="flex flex-col gap-4">
            <legend className="text-sm font-medium">Recipient</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Recipient name" htmlFor={`name-${p.id}`}>
                <Input
                  id={`name-${p.id}`}
                  data-testid="recipient-name"
                  value={p.recipientName}
                  onChange={(e) =>
                    updateParcel(p.id, "recipientName", e.target.value)
                  }
                  placeholder="Sumaiya Islam"
                  error={fieldError("recipientName")}
                  required
                />
              </Field>
              <Field label="Recipient phone" htmlFor={`phone-${p.id}`}>
                <Input
                  id={`phone-${p.id}`}
                  data-testid="recipient-phone"
                  type="tel"
                  value={p.recipientPhone}
                  onChange={(e) =>
                    updateParcel(p.id, "recipientPhone", e.target.value)
                  }
                  placeholder="+8801811112233"
                  error={fieldError("recipientPhone")}
                  required
                />
              </Field>
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-4">
            <legend className="text-sm font-medium">Delivery</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Delivery city"
                htmlFor={`city-${p.id}`}
                error={fieldError("deliveryCityId")}
              >
                <Select
                  value={p.deliveryCityId}
                  onValueChange={(v) => {
                    updateParcel(p.id, "deliveryCityId", v ?? "")
                  }}
                >
                  <SelectTrigger
                    id={`city-${p.id}`}
                    data-testid="delivery-city"
                    className="w-full"
                  >
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
              </Field>
              <Field label="Delivery address" htmlFor={`address-${p.id}`}>
                <Input
                  id={`address-${p.id}`}
                  data-testid="delivery-address"
                  value={p.deliveryAddress}
                  onChange={(e) =>
                    updateParcel(p.id, "deliveryAddress", e.target.value)
                  }
                  placeholder="Flat B2, Road 11, Banani"
                  error={fieldError("deliveryAddress")}
                  required
                />
              </Field>
              <Field
                label="Delivery map link (optional)"
                htmlFor={`map-${p.id}`}
                className="sm:col-span-2 sm:max-w-lg"
              >
                <Input
                  id={`map-${p.id}`}
                  data-testid="delivery-map"
                  type="url"
                  value={p.deliveryMapLink}
                  onChange={(e) =>
                    updateParcel(p.id, "deliveryMapLink", e.target.value)
                  }
                  placeholder="https://maps.google.com/..."
                />
              </Field>
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-4">
            <legend className="text-sm font-medium">Parcel details</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Parcel weight (KG)" htmlFor={`weight-${p.id}`}>
                <Input
                  id={`weight-${p.id}`}
                  data-testid="parcel-weight"
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*\.?[0-9]*"
                  value={p.parcelWeightKg}
                  onChange={(e) =>
                    updateParcel(p.id, "parcelWeightKg", e.target.value)
                  }
                  error={fieldError("parcelWeightKg")}
                  required
                />
              </Field>
              <Field label="Delivery type" htmlFor={`delivery-type-${p.id}`}>
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
                    data-testid="delivery-type"
                    className="w-full"
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
              </Field>
              <Field
                label="Item type"
                htmlFor={`item-type-${p.id}`}
                // Says plainly that it changes nothing about cost — the field
                // sits next to the weight and the fee, and a merchant will
                // otherwise assume the contents decide the price.
                hint="Optional. Shown to the rider collecting the parcel. It does not affect the delivery fee — that comes from the route and the weight."
                className="sm:col-span-2 sm:max-w-lg"
              >
                <Input
                  id={`item-type-${p.id}`}
                  data-testid="parcel-item-type"
                  value={p.itemType}
                  onChange={(e) =>
                    updateParcel(p.id, "itemType", e.target.value)
                  }
                  placeholder="e.g. Cotton saree, phone charger, cooked food"
                  maxLength={60}
                />
              </Field>
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-4">
            <legend className="text-sm font-medium">Payment &amp; notes</legend>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="COD amount (TK)" htmlFor={`cost-${p.id}`}>
                <Input
                  id={`cost-${p.id}`}
                  data-testid="product-cost"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={p.productCost}
                  onChange={(e) =>
                    updateParcel(p.id, "productCost", e.target.value)
                  }
                  placeholder="5000"
                  required
                />
              </Field>
              <Field label="Note (optional)" htmlFor={`note-${p.id}`}>
                <Input
                  id={`note-${p.id}`}
                  data-testid="merchant-note"
                  value={p.merchantNote}
                  onChange={(e) =>
                    updateParcel(p.id, "merchantNote", e.target.value)
                  }
                  placeholder="e.g. Handle with care"
                  maxLength={100}
                />
              </Field>
            </div>
          </fieldset>

          {row.errors.length > 0 && (
            <div
              className="bg-destructive/10 text-destructive flex flex-col gap-1 rounded-md px-3 py-2 text-xs"
              data-testid="parcel-server-errors"
            >
              {row.errors.map((err) => (
                <span key={err}>{err}</span>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
