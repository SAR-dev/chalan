"use client"

import {
  AlertTriangle,
  Banknote,
  Bike,
  CheckCircle2,
  Navigation,
  PackageCheck,
  PackagePlus,
  ShieldCheck,
  Truck,
} from "lucide-react"
import { PageHeader } from "@/components/page-header"
import { StatCardList } from "@/components/stat-card-list"
import { pageContent } from "@/config/content"
import { statCardLabels } from "@/config/stat-card-labels"
import { useAuth } from "@/features/account/hooks/use-auth"
import { useWarehouses } from "@/features/warehouses/hooks/use-warehouses"
import { ORDER_STATUS_LABELS } from "@/lib/constants"

/**
 * The statuses this page tiles, in board order.
 *
 * Duplicated from the page's `ACTIONABLE_STATUSES` rather than imported: that
 * constant is a server module (it pulls in Drizzle), and importing it here
 * would drag the database into the client bundle. The server spec asserts the
 * two lists agree, so the copy cannot drift silently.
 */
const TILES = [
  { status: "PENDING", icon: ShieldCheck, tone: "bg-chart-3/15 text-chart-3" },
  {
    status: "APPROVED",
    icon: CheckCircle2,
    tone: "bg-chart-1/15 text-chart-1",
  },
  {
    // Same chart-1 as APPROVED on purpose: the two are one leg (waiting to be
    // collected, then heading to collect) and reading them as a pair is more
    // useful than giving each its own colour.
    status: "OUT_FOR_PICKUP",
    icon: Navigation,
    tone: "bg-chart-1/15 text-chart-1",
  },
  {
    status: "PICKED_UP",
    icon: PackagePlus,
    tone: "bg-primary/10 text-primary",
  },
  {
    status: "IN_WAREHOUSE",
    icon: PackageCheck,
    tone: "bg-chart-2/15 text-chart-2",
  },
  { status: "IN_TRANSIT", icon: Bike, tone: "bg-chart-4/15 text-chart-4" },
  {
    status: "OUT_FOR_DELIVERY",
    icon: Truck,
    tone: "bg-chart-5/15 text-chart-5",
  },
  {
    status: "FAILED_ATTEMPT",
    icon: AlertTriangle,
    tone: "bg-destructive/10 text-destructive",
  },
] as const

type TileStatus = (typeof TILES)[number]["status"]

/**
 * The warehouse homepage: numbers, and nothing else.
 *
 * It used to be the intake queue — a table of parcels to receive, with three
 * stat tiles above it. That made the landing page a work surface rather than a
 * dashboard, and split the counts from the lists they describe: the "Incoming
 * 12" tile sat two scrolls above the twelve rows it counted, and both were
 * about intake while APPROVED and the failed parcels had no home on the page
 * at all. The board and the queues now own the rows; this page owns the counts.
 *
 * Note that the tiles do *not* mirror page ownership one-to-one. PENDING is the
 * approval queue, the middle four are the board, FAILED_ATTEMPT is Exceptions —
 * and the COD tile has no page of its own to be a link to, which is why nothing
 * here is clickable. `StatCardItem` has no `href` slot, and wrapping a card in
 * an anchor would nest interactive elements.
 */
export function WarehouseOverviewClient({
  counts,
  codPending,
}: {
  counts: Partial<Record<TileStatus, number>>
  codPending: number
}) {
  const { currentUser } = useAuth()
  const { currentWarehouse } = useWarehouses()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={pageContent.warehouse.overview.title(
          currentUser?.name.split(" ")[0] ?? "Admin",
        )}
        description={pageContent.warehouse.overview.description(
          currentWarehouse?.name ?? "your warehouse",
        )}
      />

      <StatCardList
        columns={4}
        items={[
          ...TILES.map(({ status, icon, tone }) => ({
            // Keyed by status, not label: the label is shared with the badge
            // component and could be edited independently.
            key: status,
            label: ORDER_STATUS_LABELS[status],
            // Absent (not zero) when the warehouse has nothing in that state —
            // the server only returns statuses it counted.
            value: counts[status] ?? 0,
            icon,
            tone,
          })),
          {
            key: "COD_PENDING",
            label:
              statCardLabels.warehouse.codSettlement.awaitingSettlement.label,
            value: codPending,
            icon: Banknote,
            tone: "bg-chart-3/15 text-chart-3",
          },
        ]}
      />
    </div>
  )
}
