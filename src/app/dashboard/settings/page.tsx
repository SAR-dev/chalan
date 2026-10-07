"use client"

import {
  CheckCircle2,
  Loader2,
  MoreHorizontal,
  Plus,
  Power,
  Trash2,
} from "lucide-react"
import { useEffect, useState } from "react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { DataTable, type DataTableColumn } from "@/components/data-table"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { pageContent } from "@/config/content"
import { useAuth } from "@/features/account/hooks/use-auth"
import { CreateMailConfigDialog } from "@/features/platform-config/dialogs/create-mail-config-dialog"
import {
  type MailConfigRecord,
  useMailConfigs,
} from "@/features/platform-config/hooks/use-mail-configs"
import { usePlatformConfig } from "@/features/platform-config/hooks/use-platform-config"
import { toast } from "@/lib/notify"
import { isValidEmail } from "@/lib/validation"

const emptyForm = {
  label: "",
  host: "",
  port: "587",
  secure: false,
  user: "",
  pass: "",
  fromEmail: "",
  fromName: "",
}

export default function DashboardSettingsPage() {
  const { config, isLoading, updatePlatformConfig } = usePlatformConfig()
  const { currentUser } = useAuth()

  // Delivery, COD and cancellation *rates* are per-lane `zone_pricing` rows and
  // are edited on the zone rate card, not here. The only platform-wide policy
  // left is whether a cancelled order keeps its fees.
  const [refundOnCancel, setRefundOnCancel] = useState(true)
  const [saving, setSaving] = useState(false)

  // R9 scan toggles — same optimistic-default + skeleton pattern as
  // refundOnCancel: the switches render `true` until the config resolves.
  const [pickupScanRequired, setPickupScanRequired] = useState(true)
  const [deliveryScanRequired, setDeliveryScanRequired] = useState(true)
  const [warehouseScanRequired, setWarehouseScanRequired] = useState(true)
  const [warehouseReceiveScanRequired, setWarehouseReceiveScanRequired] =
    useState(true)
  const [scanSaving, setScanSaving] = useState(false)

  // Mail config state
  const {
    mailConfigs,
    isLoading: mailLoading,
    isRefreshing: mailRefreshing,
    refresh: loadMailConfigs,
    createMailConfig,
    testMailConfig,
    activateMailConfig,
    deleteMailConfig,
  } = useMailConfigs()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  // Recipient for "Send test email". null = untouched, so the default tracks
  // the signed-in admin while an explicit edit (including clearing) sticks.
  const [testTo, setTestTo] = useState<string | null>(null)
  const testRecipient = testTo ?? currentUser?.email ?? ""
  const [mailSaving, setMailSaving] = useState(false)
  const [mailTesting, setMailTesting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<MailConfigRecord | null>(
    null,
  )
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  useEffect(() => {
    if (!config) return
    setRefundOnCancel(config.refundOnCancel !== false)
    setPickupScanRequired(config.pickupScanRequired !== false)
    setDeliveryScanRequired(config.deliveryScanRequired !== false)
    setWarehouseScanRequired(config.warehouseScanRequired !== false)
    setWarehouseReceiveScanRequired(
      config.warehouseReceiveScanRequired !== false,
    )
  }, [config])

  async function handleSave() {
    setSaving(true)
    const result = await updatePlatformConfig({ refundOnCancel })
    setSaving(false)
    if (result.ok) {
      toast.success("Cancellation policy updated.")
    } else {
      toast.error(result.error ?? "Failed to update.")
    }
  }

  async function handleSaveScan() {
    setScanSaving(true)
    const result = await updatePlatformConfig({
      pickupScanRequired,
      deliveryScanRequired,
      warehouseScanRequired,
      warehouseReceiveScanRequired,
    })
    setScanSaving(false)
    if (result.ok) {
      toast.success("Scan policy updated.")
    } else {
      toast.error(result.error ?? "Failed to update.")
    }
  }

  async function handleCreateMail() {
    setMailSaving(true)
    try {
      const result = await createMailConfig(form)
      if (result.ok) {
        toast.success("Mail config created.")
        setDialogOpen(false)
        setForm(emptyForm)
      } else {
        toast.error(result.error ?? "Failed to create config.")
      }
    } finally {
      setMailSaving(false)
    }
  }

  async function handleTestMail() {
    if (!isValidEmail(testRecipient)) {
      toast.error("Enter a valid recipient email address.")
      return
    }
    setMailTesting(true)
    try {
      const result = await testMailConfig({ ...form, to: testRecipient })
      if (result.ok) {
        toast.success(`Test email sent to ${testRecipient}.`)
      } else {
        toast.error(result.error ?? "Failed to send test email.")
      }
    } finally {
      setMailTesting(false)
    }
  }

  async function handleActivate(id: string) {
    const result = await activateMailConfig(id)
    if (result.ok) {
      toast.success("Config activated.")
    } else {
      toast.error(result.error ?? "Failed to activate config.")
    }
  }

  async function handleDeleteMail() {
    if (!deleteTarget) return
    setDeleteLoading(true)
    try {
      const result = await deleteMailConfig(deleteTarget.id)
      if (result.ok) {
        toast.success("Config deleted.")
        setDeleteOpen(false)
        setDeleteTarget(null)
      } else {
        toast.error(result.error ?? "Failed to delete config.")
      }
    } finally {
      setDeleteLoading(false)
    }
  }

  const mailColumns: DataTableColumn<MailConfigRecord>[] = [
    {
      id: "status",
      header: "Status",
      sortable: true,
      sortValue: (c) => (c.isActive ? "a" : "z"),
      cell: (c) =>
        c.isActive ? (
          <Badge variant="outline" className="gap-1 text-green-600">
            <CheckCircle2 className="size-3" />
            Active
          </Badge>
        ) : (
          <Badge variant="secondary">Inactive</Badge>
        ),
    },
    {
      id: "label",
      header: "Label",
      sortable: true,
      sortValue: (c) => c.label,
      cell: (c) => <span className="font-medium">{c.label}</span>,
    },
    {
      id: "host",
      header: "SMTP Server",
      sortable: true,
      sortValue: (c) => c.host,
      cell: (c) => (
        <span className="text-muted-foreground text-sm">
          {c.host}:{c.port}
        </span>
      ),
    },
    {
      id: "from",
      header: "Sender",
      sortValue: (c) => `${c.fromName} <${c.fromEmail}>`,
      cell: (c) => (
        <span className="text-muted-foreground text-sm">
          {c.fromName} &lt;{c.fromEmail}&gt;
        </span>
      ),
    },
    {
      id: "actions",
      sticky: true,
      header: "",
      align: "right",
      headClassName: "w-12",
      cell: (c) => (
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="icon">
                  <MoreHorizontal className="size-4" />
                  <span className="sr-only">Actions</span>
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-40">
              {!c.isActive && (
                <DropdownMenuItem onClick={() => handleActivate(c.id)}>
                  <Power className="size-4" />
                  Activate
                </DropdownMenuItem>
              )}
              {!c.isActive && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => {
                      setDeleteTarget(c)
                      setDeleteOpen(true)
                    }}
                  >
                    <Trash2 className="size-4" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
              {c.isActive && (
                <DropdownMenuItem disabled>
                  <CheckCircle2 className="size-4" />
                  Active config
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={pageContent.dashboard.settings.title}
        description={pageContent.dashboard.settings.description}
      />

      <Card data-testid="cancellation-policy-card">
        <CardHeader>
          <CardTitle>Order cancellation policy</CardTitle>
          <CardDescription>
            Delivery, COD and cancellation <em>rates</em> are set per delivery
            route on the zone rate card, not here.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            // Withheld, not blanked. The header, the card title and the
            // description are true the moment the page mounts, so rendering
            // them costs nothing and keeps the layout from jumping. What
            // cannot be shown is the switch: `refundOnCancel` starts at its
            // optimistic default, and before `/api/platform-config` resolves
            // it would display a policy the server may not hold. One
            // placeholder row is the honest minimum.
            <div
              className="flex items-center justify-between gap-4 rounded-lg border p-3"
              data-testid="cancellation-policy-loading"
            >
              <div className="space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-64" />
              </div>
              <Skeleton className="h-6 w-11" />
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div>
                <Label htmlFor="refund-on-cancel">
                  Refund fees on cancellation
                </Label>
                <p className="text-muted-foreground text-xs">
                  When off, a cancelled order keeps its delivery and COD fees.
                </p>
              </div>
              <Switch
                id="refund-on-cancel"
                data-testid="refund-on-cancel-switch"
                checked={refundOnCancel}
                onCheckedChange={(v) => setRefundOnCancel(v)}
              />
            </div>
          )}
        </CardContent>
        <CardFooter className="justify-end">
          <Button
            onClick={handleSave}
            // A save before the config arrives would write a value the client
            // guessed rather than one the admin read off the switch.
            disabled={saving || isLoading}
            data-testid="save-policy"
          >
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving
              </>
            ) : (
              "Save policy"
            )}
          </Button>
        </CardFooter>
      </Card>

      <Card data-testid="scan-policy-card">
        <CardHeader>
          <CardTitle>Parcel QR scanning</CardTitle>
          <CardDescription>
            Ask the rider or the warehouse admin to scan the parcel label QR
            code at each possession change. Manual code entry is always
            available either way.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            // Same withheld-not-blanked pattern as the card above: the header
            // and description are true immediately, the switches wait for the
            // server so we never show a policy the server may not hold.
            <>
              <div
                className="flex items-center justify-between gap-4 rounded-lg border p-3"
                data-testid="scan-policy-loading"
              >
                <div className="space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-64" />
                </div>
                <Skeleton className="h-6 w-11" />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-64" />
                </div>
                <Skeleton className="h-6 w-11" />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-64" />
                </div>
                <Skeleton className="h-6 w-11" />
              </div>
              <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <div className="space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-64" />
                </div>
                <Skeleton className="h-6 w-11" />
              </div>
            </>
          ) : (
            <>
              <div className="space-y-3">
                <p className="text-sm font-medium">Rider</p>
                <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                  <div>
                    <Label htmlFor="pickup-scan-required">Scan at pickup</Label>
                    <p className="text-muted-foreground text-xs">
                      Rider scans the label when marking the parcel picked up.
                    </p>
                  </div>
                  <Switch
                    id="pickup-scan-required"
                    data-testid="pickup-scan-required-switch"
                    checked={pickupScanRequired}
                    onCheckedChange={(v) => setPickupScanRequired(v)}
                  />
                </div>
                <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                  <div>
                    <Label htmlFor="warehouse-scan-required">
                      Scan at warehouse handoff
                    </Label>
                    <p className="text-muted-foreground text-xs">
                      Rider scans the label when taking the parcel out for
                      delivery.
                    </p>
                  </div>
                  <Switch
                    id="warehouse-scan-required"
                    data-testid="warehouse-scan-required-switch"
                    checked={warehouseScanRequired}
                    onCheckedChange={(v) => setWarehouseScanRequired(v)}
                  />
                </div>
                <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                  <div>
                    <Label htmlFor="delivery-scan-required">
                      Scan at delivery
                    </Label>
                    <p className="text-muted-foreground text-xs">
                      Rider scans the label when marking the parcel delivered.
                    </p>
                  </div>
                  <Switch
                    id="delivery-scan-required"
                    data-testid="delivery-scan-required-switch"
                    checked={deliveryScanRequired}
                    onCheckedChange={(v) => setDeliveryScanRequired(v)}
                  />
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium">Warehouse admin</p>
                <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
                  <div>
                    <Label htmlFor="warehouse-receive-scan-required">
                      Scan at warehouse receive
                    </Label>
                    <p className="text-muted-foreground text-xs">
                      Warehouse admin scans the label when receiving the parcel
                      from the rider.
                    </p>
                  </div>
                  <Switch
                    id="warehouse-receive-scan-required"
                    data-testid="warehouse-receive-scan-required-switch"
                    checked={warehouseReceiveScanRequired}
                    onCheckedChange={(v) => setWarehouseReceiveScanRequired(v)}
                  />
                </div>
              </div>
            </>
          )}
        </CardContent>
        <CardFooter className="justify-end">
          <Button
            onClick={handleSaveScan}
            // A save before the config arrives would write a value the client
            // guessed rather than one the admin read off the switches.
            disabled={scanSaving || isLoading}
            data-testid="save-scan-policy"
          >
            {scanSaving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving
              </>
            ) : (
              "Save policy"
            )}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Mail Configuration</CardTitle>
              <CardDescription>
                Manage SMTP settings for outgoing emails.
              </CardDescription>
            </div>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="size-4" />
              Add Config
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            pinnedColumns={["status"]}
            id="dashboard-mail-config"
            columns={mailColumns}
            data={mailConfigs}
            getRowKey={(c) => c.id}
            initialSortId="status"
            loading={mailLoading || mailRefreshing}
            onRefresh={loadMailConfigs}
            emptyMessage="No mail configs yet. Add one to start sending emails."
          />
        </CardContent>
      </Card>

      <CreateMailConfigDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        form={form}
        onFormChange={setForm}
        onSubmit={handleCreateMail}
        onTest={handleTestMail}
        testTo={testRecipient}
        onTestToChange={setTestTo}
        saving={mailSaving}
        testing={mailTesting}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        loading={deleteLoading}
        title="Delete mail config"
        description={`Delete "${deleteTarget?.label}"? This cannot be undone.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDeleteMail}
      />
    </div>
  )
}
