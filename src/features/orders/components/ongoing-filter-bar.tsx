"use client"

import { X } from "lucide-react"
import { SearchInput } from "@/components/search-input"
import { Button } from "@/components/ui/button"
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

interface OngoingFilterBarProps {
  filters: OngoingFilters
  onChange: (next: OngoingFilters) => void
  /** The warehouse's roster, in whatever order the API returned. */
  riders: Rider[]
  /** Every delivery city, sorted by name. Shared by both city dropdowns. */
  cities: BoardCity[]
}

/**
 * One search box and three dropdowns for the ongoing board.
 *
 * The city dropdowns are fed the *whole* city list rather than the cities on the
 * page: an option list that changes while you are using it reads as the board
 * losing parcels. Both dropdowns read the same list because a pickup location's
 * city and a delivery city are the same kind of thing — a `delivery_city` row —
 * so there is one source and the two cannot drift apart.
 *
 * Values are ids, not names. "Chattogram" is unique today, but a filter keyed on
 * display text silently merges two cities the day someone adds a second one.
 */
export function OngoingFilterBar({
  filters,
  onChange,
  riders,
  cities,
}: OngoingFilterBarProps) {
  // Alphabetical, `numeric` so "Hub 2" sorts before "Hub 10". The roster arrives
  // in whatever order the API returned.
  const sortedRiders = [...riders].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  )

  // Base UI renders `SelectValue` as the *raw* value unless a child is supplied
  // (the same way `assign-pickup-rider-dialog` does it), so an uncontrolled
  // dropdown would show "any" instead of "All riders". Every label is resolved
  // here, from the same list the popup is built from.
  const riderLabel =
    filters.riderId === ANY_RIDER
      ? ALL_RIDERS
      : (riders.find((r) => r.id === filters.riderId)?.name ?? filters.riderId)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <SearchInput
        value={filters.query}
        onChange={(query) => onChange({ ...filters, query })}
        placeholder={`Search ${columnLabels.order.order} ID`}
        testId={`${TESTID}-query`}
      />

      <Select
        value={filters.riderId}
        onValueChange={(value) => {
          if (value) onChange({ ...filters, riderId: value })
        }}
      >
        <SelectTrigger
          data-testid={`${TESTID}-rider`}
          aria-label={columnLabels.order.rider}
          className="h-8 w-auto min-w-[9.5rem] text-xs"
        >
          <SelectValue placeholder={ALL_RIDERS}>{riderLabel}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ANY_RIDER}>{ALL_RIDERS}</SelectItem>
          {sortedRiders.map((rider) => (
            <SelectItem
              key={rider.id}
              value={rider.id}
              data-testid={`${TESTID}-rider-option-${rider.id}`}
              className="text-xs"
            >
              {rider.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <CityFilter
        label={columnLabels.order.pickupCity}
        testIdName="pickup-city"
        value={filters.pickupCityId}
        cities={cities}
        onChange={(pickupCityId) => onChange({ ...filters, pickupCityId })}
      />

      <CityFilter
        label={columnLabels.order.deliveryCity}
        testIdName="delivery-city"
        value={filters.deliveryCityId}
        cities={cities}
        onChange={(deliveryCityId) => onChange({ ...filters, deliveryCityId })}
      />

      {isFiltering(filters) && (
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
      )}
    </div>
  )
}

function CityFilter({
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
  // `aria-label` stays the *field* ("Pickup city") while `SelectValue` shows the
  // selection — a control whose accessible name changed with the selection
  // would make a screen-reader user lose their place in the toolbar on every
  // change. An id with no matching city can only be stale state, so show it
  // verbatim rather than silently claiming "All cities".
  const selectedLabel =
    value === ANY_CITY
      ? ALL_CITIES
      : (cities.find((c) => c.id === value)?.name ?? value)

  return (
    <Select
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next)
      }}
    >
      <SelectTrigger
        data-testid={`${TESTID}-${testIdName}`}
        aria-label={label}
        className="h-8 w-auto min-w-[9.5rem] text-xs"
      >
        <SelectValue placeholder={ALL_CITIES}>{selectedLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ANY_CITY}>{ALL_CITIES}</SelectItem>
        {cities.map((city) => (
          <SelectItem
            key={city.id}
            value={city.id}
            data-testid={`${TESTID}-${testIdName}-option-${city.id}`}
            className="text-xs"
          >
            {city.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
