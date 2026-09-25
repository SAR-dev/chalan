"use client"

import { MapPin } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { PickupLocation } from "@/lib/types"

interface PickupLocationCardProps {
  myLocations: PickupLocation[]
  pickupLocationId: string
  setPickupLocationId: (value: string) => void
}

export function PickupLocationCard({
  myLocations,
  pickupLocationId,
  setPickupLocationId,
}: PickupLocationCardProps) {
  return (
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
  )
}
