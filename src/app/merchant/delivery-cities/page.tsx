"use client"

import { MapPin, Search } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { PageHeader } from "@/components/page-header"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useAuth } from "@/features/account/hooks/use-auth"
import { useDeliveryCities } from "@/features/platform-config/hooks/use-delivery-cities"
import { useDeliveryZones } from "@/features/platform-config/hooks/use-delivery-zones"
import { hasNavPermission } from "@/lib/nav-config"
import { cn } from "@/lib/utils"

/**
 * What a merchant can deliver to, grouped by zone.
 *
 * Read-only reference: the zones and cities are platform-owned, and the data
 * comes from the same public endpoints the order form uses — there is nothing
 * for a merchant to edit here. Grouping by zone rather than one flat list is
 * the point: "is Sylhet covered?" and "which cities are in the divisional
 * zone?" are the questions this answers, and both need the zone as context.
 *
 * Owner-only: moderators get the nav entry from grants, and this is a
 * reference surface rather than an order-taking one, so it is not grantable.
 */

type CityGroup = {
  zoneId: string
  zoneName: string
  cities: Array<{ id: string; name: string }>
}

export default function DeliveryCitiesPage() {
  const router = useRouter()
  const { currentUser, isReady } = useAuth()
  const {
    zones,
    isLoading: zonesLoading,
    error: zonesError,
  } = useDeliveryZones()
  const {
    cities,
    isLoading: citiesLoading,
    error: citiesError,
  } = useDeliveryCities()
  const [query, setQuery] = useState("")

  const allowed = hasNavPermission(currentUser, "/merchant/delivery-cities")

  // Wait for the session before deciding: `hasNavPermission` fails closed on a
  // missing subject, so acting on it before `isReady` would bounce every
  // legitimate visitor off their own sidebar entry.
  useEffect(() => {
    if (isReady && currentUser && !allowed) router.replace("/merchant")
  }, [isReady, currentUser, allowed, router])

  const groups: CityGroup[] = useMemo(() => {
    const zoneNameById = new Map(zones.map((z) => [z.id, z.name]))
    const byZone = new Map<string, Array<{ id: string; name: string }>>()

    // Grouped from the cities, not from the zone list, so an active city
    // sitting on a zone we could not load is still shown rather than silently
    // dropped.
    for (const city of cities) {
      const key = city.zoneId ?? "__none"
      const list = byZone.get(key) ?? []
      list.push({ id: city.id, name: city.name })
      byZone.set(key, list)
    }

    return [...byZone.entries()].map(([zoneId, list]) => ({
      zoneId,
      zoneName: zoneNameById.get(zoneId) ?? "Unassigned",
      cities: list.sort((a, b) => a.name.localeCompare(b.name)),
    }))
  }, [cities, zones])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return groups
    return groups
      .map((group) => {
        const zoneMatches = group.zoneName.toLowerCase().includes(needle)
        return zoneMatches
          ? group
          : {
              ...group,
              cities: group.cities.filter((c) =>
                c.name.toLowerCase().includes(needle),
              ),
            }
      })
      .filter((group) => group.cities.length > 0)
  }, [groups, query])

  const totalCities = groups.reduce((sum, g) => sum + g.cities.length, 0)
  const totalVisible = filtered.reduce((sum, g) => sum + g.cities.length, 0)
  const isLoading = zonesLoading || citiesLoading
  const loadError = zonesError || citiesError

  if (!isReady || !allowed) return null

  return (
    <>
      <PageHeader
        title="Delivery Cities"
        description="Every city the platform delivers to, grouped by its zone. Set by the platform — these are the destinations you can book."
      />

      <div className="flex flex-col gap-6" data-testid="delivery-cities-page">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="size-4" />
              Zones and cities
            </CardTitle>
            <CardDescription>
              {isLoading
                ? "Loading delivery coverage…"
                : `${totalCities} ${totalCities === 1 ? "city" : "cities"} across ${groups.length} ${groups.length === 1 ? "zone" : "zones"}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="relative">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
              <Input
                data-testid="delivery-city-search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search cities or zones…"
                aria-label="Search delivery cities"
                className="pl-9"
              />
            </div>

            {loadError ? (
              <p
                className="text-muted-foreground rounded-lg border px-4 py-8 text-center text-sm"
                data-testid="delivery-cities-error"
              >
                Could not load delivery coverage. Reload to try again.
              </p>
            ) : isLoading ? (
              <p
                className="text-muted-foreground rounded-lg border px-4 py-8 text-center text-sm"
                data-testid="delivery-cities-loading"
              >
                Loading delivery coverage…
              </p>
            ) : filtered.length === 0 ? (
              <p
                className="text-muted-foreground rounded-lg border px-4 py-8 text-center text-sm"
                data-testid="delivery-cities-empty"
              >
                No cities match “{query.trim()}”.
              </p>
            ) : (
              filtered.map((group) => (
                <section
                  key={group.zoneId}
                  data-testid={`delivery-zone-${group.zoneId}`}
                  className="border-border rounded-lg border"
                >
                  <header className="bg-muted/50 border-border flex items-baseline justify-between gap-3 border-b px-4 py-2.5">
                    <h3 className="text-sm font-semibold">{group.zoneName}</h3>
                    <span
                      className="text-muted-foreground text-xs"
                      data-testid={`delivery-zone-count-${group.zoneId}`}
                    >
                      {group.cities.length}{" "}
                      {group.cities.length === 1 ? "city" : "cities"}
                    </span>
                  </header>
                  <ul className="grid grid-cols-1 gap-px sm:grid-cols-2 lg:grid-cols-3">
                    {group.cities.map((city) => (
                      <li
                        key={city.id}
                        data-testid={`delivery-city-${city.id}`}
                        className={cn(
                          "flex items-center gap-2 px-4 py-2 text-sm",
                        )}
                      >
                        <MapPin className="text-muted-foreground size-3.5 shrink-0" />
                        <span className="truncate">{city.name}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}

            {!isLoading && !loadError && totalVisible < totalCities ? (
              <p className="text-muted-foreground text-xs" aria-live="polite">
                Showing {totalVisible} of {totalCities} cities.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
