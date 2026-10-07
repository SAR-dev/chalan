"use client"

import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"
import { useState } from "react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import {
  CellTwoRow,
  DataTable,
  type DataTableColumn,
} from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Switch } from "@/components/ui/switch"
import { pageContent } from "@/config/content"
import { PackageRequestQueue } from "@/features/packages/components/package-request-queue"
import { CreatePackageDialog } from "@/features/packages/dialogs/create-package-dialog"
import { EditPackageDialog } from "@/features/packages/dialogs/edit-package-dialog"
import { TierDialog } from "@/features/packages/dialogs/tier-dialog"
import {
  type PackageRow,
  type PackageTier,
  usePackages,
} from "@/features/packages/hooks/use-packages"
import { toast } from "@/lib/notify"
import { tierLabel } from "@/lib/packages"
import { formatTk } from "@/lib/pricing"

export default function PackagesPage() {
  const {
    packages,
    updatePackage,
    deletePackage,
    deleteTier,
    isLoading,
    isRefreshing,
  } = usePackages()

  const [editing, setEditing] = useState<PackageRow | null>(null)
  const [tierFor, setTierFor] = useState<PackageRow | null>(null)
  const [editingTier, setEditingTier] = useState<PackageTier | null>(null)
  const [deleting, setDeleting] = useState<PackageRow | null>(null)
  const [deletingTier, setDeletingTier] = useState<{
    pkg: PackageRow
    tier: PackageTier
  } | null>(null)
  const [busy, setBusy] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  async function handleToggleActive(pkg: PackageRow) {
    setTogglingId(pkg.id)
    const res = await updatePackage(pkg.id, { isActive: !pkg.isActive })
    setTogglingId(null)
    if (!res.ok) {
      toast.error(res.error ?? "Could not update the package.")
      return
    }
    toast.success(`"${pkg.name}" ${pkg.isActive ? "hidden" : "published"}.`)
  }

  async function handleDelete() {
    if (!deleting) return
    setBusy(true)
    const res = await deletePackage(deleting.id)
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error ?? "Could not delete the package.")
      return
    }
    toast.success(
      res.archived
        ? `"${deleting.name}" still has purchases against it, so it was archived instead of deleted.`
        : `Package "${deleting.name}" deleted.`,
    )
    setDeleting(null)
  }

  async function handleDeleteTier() {
    if (!deletingTier) return
    setBusy(true)
    const res = await deleteTier(deletingTier.pkg.id, deletingTier.tier.id)
    setBusy(false)
    if (!res.ok) {
      toast.error(res.error ?? "Could not delete the tier.")
      return
    }
    toast.success(`Tier at ${deletingTier.tier.orderCount} orders removed.`)
    setDeletingTier(null)
  }

  const columns: DataTableColumn<PackageRow>[] = [
    {
      id: "name",
      header: "Package",
      sortable: true,
      sortValue: (p) => p.name,
      cell: (p) => (
        <CellTwoRow primary={p.name} secondary={p.description ?? "—"} />
      ),
    },
    {
      id: "price",
      header: "Price",
      sortable: true,
      sortValue: (p) => Number(p.price),
      cell: (p) => (
        <span className="font-medium">{formatTk(Number(p.price))}</span>
      ),
    },
    {
      id: "tiers",
      header: "Tiers",
      cell: (p) => (
        <div className="flex flex-col gap-1">
          {p.tiers.length === 0 ? (
            <span className="text-muted-foreground text-xs">
              No discount tiers
            </span>
          ) : (
            p.tiers.map((t) => (
              <button
                key={t.id}
                type="button"
                data-testid={`tier-edit-${t.id}`}
                className="text-muted-foreground hover:text-foreground text-left text-xs underline-offset-2 hover:underline"
                onClick={() => {
                  setTierFor(p)
                  setEditingTier(t)
                }}
              >
                <span className="font-medium">≥ {t.orderCount} orders</span>
                <span aria-hidden> · </span>
                {tierLabel(t)}
              </button>
            ))
          )}
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (p) => (
        <div className="flex items-center gap-2">
          <Switch
            checked={p.isActive}
            disabled={togglingId === p.id}
            data-testid={`package-active-${p.id}`}
            onCheckedChange={() => handleToggleActive(p)}
            aria-label={`Toggle active state for ${p.name}`}
          />
          <StatusBadge
            label={p.isActive ? "Live" : "Hidden"}
            tone={p.isActive ? "success" : "neutral"}
          />
        </div>
      ),
    },
    {
      id: "actions",
      sticky: true,
      header: "",
      align: "right",
      headClassName: "w-12",
      cell: (p) => (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  data-testid={`package-actions-${p.id}`}
                >
                  <MoreHorizontal className="size-4" />
                  <span className="sr-only">Actions</span>
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem
                data-testid={`package-add-tier-${p.id}`}
                onClick={() => {
                  setTierFor(p)
                  setEditingTier(null)
                }}
              >
                <Plus className="size-4" />
                Add tier
              </DropdownMenuItem>
              <DropdownMenuItem
                data-testid={`package-edit-${p.id}`}
                onClick={() => setEditing(p)}
              >
                <Pencil className="size-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                data-testid={`package-delete-${p.id}`}
                onClick={() => setDeleting(p)}
              >
                <Trash2 className="size-4" />
                Delete
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {p.tiers.map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  variant="destructive"
                  data-testid={`package-delete-tier-${t.id}`}
                  onClick={() => setDeletingTier({ pkg: p, tier: t })}
                >
                  <Trash2 className="size-4" />
                  Remove tier at {t.orderCount}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ]

  return (
    <>
      <PageHeader
        title={pageContent.dashboard.packages.title}
        description={pageContent.dashboard.packages.description}
      >
        <CreatePackageDialog />
      </PageHeader>

      <Card>
        <CardContent className="p-0">
          <DataTable
            pinnedColumns={["name"]}
            id="dashboard-packages"
            searchable
            searchColumns={["name", "tiers"]}
            columns={columns}
            data={packages}
            getRowKey={(p) => p.id}
            emptyMessage="No packages yet. Create one to start selling prepaid delivery bundles."
            loading={isLoading || isRefreshing}
          />
        </CardContent>
      </Card>

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-semibold">Purchase requests</h2>
        <PackageRequestQueue />
      </div>

      <EditPackageDialog pkg={editing} onClose={() => setEditing(null)} />
      {tierFor && (
        <TierDialog
          pkg={tierFor}
          tier={editingTier}
          onClose={() => {
            setTierFor(null)
            setEditingTier(null)
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete package"
        description={
          deleting
            ? `Remove "${deleting.name}"? If a merchant has bought it, it will be archived instead so the purchase history stays intact.`
            : ""
        }
        confirmLabel="Delete package"
        variant="destructive"
        loading={busy}
        onConfirm={handleDelete}
      />

      <ConfirmDialog
        open={deletingTier !== null}
        onOpenChange={(o) => !o && setDeletingTier(null)}
        title="Remove tier"
        description={
          deletingTier
            ? `Remove the ${deletingTier.tier.orderCount}-order tier from "${deletingTier.pkg.name}"? Orders already priced with it keep their snapshot.`
            : ""
        }
        confirmLabel="Remove tier"
        loading={busy}
        onConfirm={handleDeleteTier}
      />
    </>
  )
}
