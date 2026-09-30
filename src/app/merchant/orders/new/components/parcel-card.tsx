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
import type { ParcelRow, ParcelState } from "../types"

interface ParcelCardProps {
  row: ParcelRow
  index: number
  parcelCount: number
  deliveryCities: DeliveryCityOption[]
  myLocations: Array<{ id: string; label: string }>
  updateParcel: <K extends keyof ParcelState>(
    id: string,
    key: K,
    value: ParcelState[K],
  ) => void
  removeParcel: (id: string) => void
}

export function ParcelCard({
  row,
  index,
  parcelCount,
  deliveryCities,
  myLocations,
  updateParcel,
  removeParcel,
}: ParcelCardProps) {
  const p = row.parcel
  return (
    <Card data-testid="parcel-card">
      <CardHeader className="space-y-0 [.border-b]:pb-(--card-spacing)">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <CardTitle className="text-base">Parcel {index + 1}</CardTitle>
          <CardDescription className="text-right">
            {row.pricingUnavailable ? (
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
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`name-${p.id}`}>Recipient name</Label>
              <Input
                id={`name-${p.id}`}
                data-testid="recipient-name"
                value={p.recipientName}
                onChange={(e) =>
                  updateParcel(p.id, "recipientName", e.target.value)
                }
                placeholder="Sumaiya Islam"
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`phone-${p.id}`}>Recipient phone</Label>
              <Input
                id={`phone-${p.id}`}
                data-testid="recipient-phone"
                type="tel"
                value={p.recipientPhone}
                onChange={(e) =>
                  updateParcel(p.id, "recipientPhone", e.target.value)
                }
                placeholder="+8801811112233"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={`city-${p.id}`}>Delivery city</Label>
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
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={`address-${p.id}`}>Delivery address</Label>
              <Input
                id={`address-${p.id}`}
                data-testid="delivery-address"
                value={p.deliveryAddress}
                onChange={(e) =>
                  updateParcel(p.id, "deliveryAddress", e.target.value)
                }
                placeholder="Flat B2, Road 11, Banani"
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={`map-${p.id}`}>
                Delivery map link (optional)
              </Label>
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
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`pickup-${p.id}`}>Pickup location</Label>
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
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={`weight-${p.id}`}>Parcel weight (KG)</Label>
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
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`cost-${p.id}`}>COD amount (TK)</Label>
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
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor={`delivery-type-${p.id}`}>Delivery type</Label>
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

            <div className="flex flex-col gap-2">
              <Label htmlFor={`note-${p.id}`}>Note (optional)</Label>
              <Input
                id={`note-${p.id}`}
                value={p.merchantNote}
                onChange={(e) =>
                  updateParcel(p.id, "merchantNote", e.target.value)
                }
                placeholder="e.g. Handle with care"
                maxLength={100}
              />
            </div>
          </div>

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
}
