"use client"

import {
  ArrowRight,
  Bike,
  CheckCircle2,
  Circle,
  Package,
  ShieldCheck,
  Store,
  Warehouse as WarehouseIcon,
} from "lucide-react"
import Link from "next/link"
import { PageHeader } from "@/components/page-header"
import { StatCardList } from "@/components/stat-card-list"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { pageContent } from "@/config/content"
import { statCardLabels } from "@/config/stat-card-labels"
import { useAuth } from "@/features/account/hooks/use-auth"
import { cn } from "@/lib/utils"

interface OverviewProps {
  userName: string
  warehouseAdminCount: number
  totalWarehouses: number
  activeWarehouses: number
  pendingMerchants: number
  pendingOrders: number
  pendingRiders: number
  hasActiveMailConfig: boolean
}

function PendingOrdersBanner({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <Card className="border-chart-3/30 bg-chart-3/5 lg:col-span-3">
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="bg-chart-3/15 text-chart-3 flex size-11 items-center justify-center rounded-lg">
            <Package className="size-5" />
          </div>
          <div>
            <p className="font-medium">
              {count} order{count > 1 ? "s" : ""} awaiting approval
            </p>
            <p className="text-muted-foreground text-sm">
              Verify weight compliance, then approve and assign a pickup rider.
            </p>
          </div>
        </div>
        <Button render={<Link href="/dashboard/orders" />} nativeButton={false}>
          Review orders
          <ArrowRight className="size-4" />
        </Button>
      </CardContent>
    </Card>
  )
}

export function OverviewPageClient({
  userName,
  warehouseAdminCount,
  totalWarehouses,
  activeWarehouses,
  pendingMerchants,
  pendingOrders,
  pendingRiders,
  hasActiveMailConfig,
}: OverviewProps) {
  const { currentUser } = useAuth()

  const setupSteps = [
    {
      label: "Super Admin signed in",
      done: Boolean(currentUser),
    },
    {
      label: "At least one Warehouse created",
      done: activeWarehouses > 0,
      href: "/dashboard/warehouses",
    },
    {
      label: "At least one Warehouse Admin created",
      done: warehouseAdminCount > 0,
      href: "/dashboard/team",
    },
    {
      label: "Email configuration added and activated",
      done: hasActiveMailConfig,
      href: "/dashboard/settings",
    },
  ]

  const completed = setupSteps.filter((s) => s.done).length

  return (
    <>
      <PageHeader
        title={pageContent.dashboard.overview.title(userName)}
        description={pageContent.dashboard.overview.setupDescription}
      />

      <StatCardList
        columns={4}
        items={[
          {
            label: statCardLabels.dashboard.superAdmin.warehouseAdmins.label,
            value: warehouseAdminCount,
            icon: ShieldCheck,
          },
          {
            label: statCardLabels.dashboard.superAdmin.activeWarehouses.label,
            value: activeWarehouses,
            hint: `${totalWarehouses} total`,
            icon: WarehouseIcon,
          },
          {
            label: statCardLabels.dashboard.superAdmin.pendingMerchants.label,
            value: pendingMerchants,
            hint: statCardLabels.dashboard.superAdmin.pendingMerchants.hint,
            icon: Store,
          },
          {
            label: statCardLabels.dashboard.superAdmin.pendingRiders.label,
            value: pendingRiders,
            hint: statCardLabels.dashboard.superAdmin.pendingRiders.hint,
            icon: Bike,
          },
        ]}
      />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <PendingOrdersBanner count={pendingOrders} />

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Platform setup checklist</CardTitle>
            <CardDescription>
              {completed} of {setupSteps.length} steps complete
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {setupSteps.map((step) => {
              const row = (
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2.5",
                    step.href && !step.done && "hover:bg-muted",
                  )}
                >
                  {step.done ? (
                    <CheckCircle2 className="text-chart-2 size-5" />
                  ) : (
                    <Circle className="text-muted-foreground/50 size-5" />
                  )}
                  <span
                    className={cn(
                      "flex-1 text-sm",
                      step.done
                        ? "text-muted-foreground line-through"
                        : "font-medium",
                    )}
                  >
                    {step.label}
                  </span>
                  {step.href && !step.done ? (
                    <ArrowRight className="text-muted-foreground size-4" />
                  ) : null}
                </div>
              )
              return step.href && !step.done ? (
                <Link key={step.label} href={step.href} className="block">
                  {row}
                </Link>
              ) : (
                <div key={step.label}>{row}</div>
              )
            })}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
