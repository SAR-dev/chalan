"use client"

import { X } from "lucide-react"
import type { ReactNode } from "react"
import { SearchInput } from "@/components/search-input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { columnLabels } from "@/config/table-column-labels"
import type { Rider } from "@/lib/types"
import {
  ANY_CITY,
  ANY_RIDER,
  isFiltering,
  NO_ONGOING_FILTERS,
  type OngoingFilters,
} from "../ongoing-filters"

export interface BoardCity {
  id: string
  name: string
}

/** Prefix for every test hook on this bar — see `e2e/selectors.ts`. */
const TESTID = "kanban-filter"

const ALL_RIDERS = "All riders"
const ALL_CITIES = "All cities"

/**
 * One row of five filters: order ID, pickup rider, delivery rider, pickup city
 * and delivery city.
 *
 * Every field is labelled rather than relying on a placeholder — a placeholder
 * disappears the moment you type, which is exactly when a returning user needs
 * to be reminded what the box they are in actually filters. The labels are real
 * `<Label htmlFor>` elements wired to their control, so a screen reader reads
 * the field name and not the current value.
 *
 * The city dropdowns are fed the **whole** `delivery_city` table rather than the
 * cities that happen to be on the page: an option list that changes while you
 * are using it reads as the board losing parcels. Both read the same list,
 * because a pickup location's city and a delivery city are the same kind of
 * thing — a `delivery_city` row — so there is one source and they cannot drift
 * apart. Values are ids, not names: "Chattogram" is unique today, but a filter
 * keyed on display text silently merges two cities the day someone adds a
 * second one.
 *
 * Layout: one column on a phone (each field full width), two on a tablet, and
 * five equal columns from `lg` up, so the whole toolbar fits one line on a
 * desktop rather than five progressively narrower fields fighting for space.
 */
export function OngoingFilterBar({
  filters,
  onChange,
  riders,
  cities,
}: OngoingFilterBarProps) {
  const sortedRiders = sortByName(riders)

  // Base UI renders `SelectValue` as the *raw* value unless a child is supplied
  // (the same way `assign-pickup-rider-dialog` does it), so an uncontrolled
  // dropdown would show "any" instead of "All riders". Every label is resolved
  // here, from the same list the popup is built from.
  const riderLabel = (id: string) =>
    id === ANY_RIDER
      ? ALL_RIDERS
      : (riders.find((r) => r.id === id)?.name ?? id)

  return (
    <div data-testid="kanban-filters" className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Field label={columnLabels.order.orderId} htmlFor={`${TESTID}-query`}>
          <SearchInput
            id={`${TESTID}-query`}
            value={filters.query}
            onChange={(query) => onChange({ ...filters, query })}
            placeholder="Search…"
            testId={`${TESTID}-query`}
            // Cancels the shared default `sm:max-w-xs` so the box fills its
            // grid cell like every other field in the row.
            className="sm:max-w-none"
          />
        </Field>

        <RiderField
          label={columnLabels.order.pickupRider}
          testIdName="pickup-rider"
          value={filters.pickupRiderId}
          riders={sortedRiders}
          riderLabel={riderLabel}
          onChange={(pickupRiderId) => onChange({ ...filters, pickupRiderId })}
        />

        <RiderField
          label={columnLabels.order.deliveryRider}
          testIdName="delivery-rider"
          value={filters.deliveryRiderId}
          riders={sortedRiders}
          riderLabel={riderLabel}
          onChange={(deliveryRiderId) =>
            onChange({ ...filters, deliveryRiderId })
          }
        />

        <CityField
          label={columnLabels.order.pickupCity}
          testIdName="pickup-city"
          value={filters.pickupCityId}
          cities={cities}
          onChange={(pickupCityId) => onChange({ ...filters, pickupCityId })}
        />

        <CityField
          label={columnLabels.order.deliveryCity}
          testIdName="delivery-city"
          value={filters.deliveryCityId}
          cities={cities}
          onChange={(deliveryCityId) =>
            onChange({ ...filters, deliveryCityId })
          }
        />
      </div>

      {isFiltering(filters) && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            data-testid={`${TESTID}-clear`}
            onClick={() => onChange({ ...NO_ONGOING_FILTERS })}
            className="text-muted-foreground h-8 px-2 text-xs"
          >
            <X className="size-3.5" />
            Clear
          </Button>
        </div>
      )}
    </div>
  )
}

interface OngoingFilterBarProps {
  filters: OngoingFilters
  onChange: (next: OngoingFilters) => void
  /** The warehouse's roster, in whatever order the caller resolved it. */
  riders: Rider[]
  /** Every delivery city, sorted by name. Shared by both city dropdowns. */
  cities: BoardCity[]
}

/** Alphabetical, `numeric` so "Hub 2" sorts before "Hub 10". */
function sortByName<T extends { name: string }>(items: T[]): T[] {
  return [...items].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  )
}

/** One labelled control in the filter grid. */
function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

function RiderField({
  label,
  testIdName,
  value,
  riders,
  riderLabel,
  onChange,
}: {
  label: string
  testIdName: string
  value: string
  riders: Rider[]
  riderLabel: (id: string) => string
  onChange: (value: string) => void
}) {
  const id = `${TESTID}-${testIdName}`
  return (
    <Field label={label} htmlFor={id}>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next) onChange(next)
        }}
      >
        <SelectTrigger id={id} data-testid={id} className="w-full text-xs">
          <SelectValue placeholder={ALL_RIDERS}>
            {riderLabel(value)}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY_RIDER}>{ALL_RIDERS}</SelectItem>
          {riders.map((rider) => (
            <SelectItem
              key={rider.id}
              value={rider.id}
              data-testid={`${id}-option-${rider.id}`}
              className="text-xs"
            >
              {rider.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

function CityField({
  label,
  testIdName,
  value,
  cities,
  onChange,
}: {
  label: string
  testIdName: string
  value: string
  cities: BoardCity[]
  onChange: (value: string) => void
}) {
  const id = `${TESTID}-${testIdName}`
  // `aria-label` is intentionally not set: the visible `<Label htmlFor>` is the
  // control's accessible name, and an accessible name that tracked the value
  // would make a screen-reader user lose their place in the toolbar on every
  // change. An id with no matching city can only be stale state, so it is shown
  // verbatim rather than silently claiming "All cities".
  const selectedLabel =
    value === ANY_CITY
      ? ALL_CITIES
      : (cities.find((c) => c.id === value)?.name ?? value)

  return (
    <Field label={label} htmlFor={id}>
      <Select
        value={value}
        onValueChange={(next) => {
          if (next) onChange(next)
        }}
      >
        <SelectTrigger id={id} data-testid={id} className="w-full text-xs">
          <SelectValue placeholder={ALL_CITIES}>{selectedLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY_CITY}>{ALL_CITIES}</SelectItem>
          {cities.map((city) => (
            <SelectItem
              key={city.id}
              value={city.id}
              data-testid={`${id}-option-${city.id}`}
              className="text-xs"
            >
              {city.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}
