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
import { toast } from "sonner"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { pageContent } from "@/config/content"
import { CreateMailConfigDialog } from "@/features/platform-config/dialogs/create-mail-config-dialog"
import { usePlatformConfig } from "@/features/platform-config/hooks/use-platform-config"
import { formatError } from "@/lib/validation"

interface MailConfig {
  id: string
  label: string
  host: string
  port: string
  secure: boolean
  user: string
  pass: string
  fromEmail: string
  fromName: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

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

  const [baseRate, setBaseRate] = useState("0")
  const [extraRatePerKg, setExtraRatePerKg] = useState("0")
  const [freeWeightKg, setFreeWeightKg] = useState("1")
  const [maxWeightKg, setMaxWeightKg] = useState("3")
  const [cancellationFee, setCancellationFee] = useState("0")
  const [saving, setSaving] = useState(false)

  // Mail config state
  const [mailConfigs, setMailConfigs] = useState<MailConfig[]>([])
  const [mailLoading, setMailLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [mailSaving, setMailSaving] = useState(false)
  const [mailTesting, setMailTesting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<MailConfig | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)

  useEffect(() => {
    if (!config) return
    setBaseRate(String(config.defaultBaseRate ?? 0))
    setExtraRatePerKg(String(config.defaultExtraRatePerKg ?? 0))
    setFreeWeightKg(String(config.defaultFreeWeightKg ?? 1))
    setMaxWeightKg(String(config.defaultMaxWeightKg ?? 3))
    setCancellationFee(String(config.defaultCancellationFee ?? 0))
  }, [config])

  async function loadMailConfigs() {
    setMailLoading(true)
    try {
      const res = await fetch("/api/admin/mail-config")
      if (res.ok) setMailConfigs(await res.json())
    } finally {
      setMailLoading(false)
    }
  }

  useEffect(() => {
    loadMailConfigs()
  }, [])

  if (isLoading) return null

  async function handleSave() {
    const parsed = {
      defaultBaseRate: Number(baseRate) || 0,
      defaultExtraRatePerKg: Number(extraRatePerKg) || 0,
      defaultFreeWeightKg: Number(freeWeightKg) || 0,
      defaultMaxWeightKg: Number(maxWeightKg) || 3,
      defaultCancellationFee: Number(cancellationFee) || 0,
    }
    if (parsed.defaultMaxWeightKg <= 0) {
      toast.error("Max weight must be greater than 0.")
      return
    }
    if (parsed.defaultFreeWeightKg > parsed.defaultMaxWeightKg) {
      toast.error("Free weight cannot exceed max weight.")
      return
    }
    setSaving(true)
    const result = await updatePlatformConfig(parsed)
    setSaving(false)
    if (result.ok) {
      toast.success("Platform defaults updated.")
    } else {
      toast.error(result.error ?? "Failed to update.")
    }
  }

  async function handleCreateMail() {
    setMailSaving(true)
    try {
      const res = await fetch("/api/admin/mail-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        toast.success("Mail config created.")
        setDialogOpen(false)
        setForm(emptyForm)
        loadMailConfigs()
      } else {
        const resData = await res.json()
        toast.error(formatError(resData, "Failed to create config."))
      }
    } finally {
      setMailSaving(false)
    }
  }

  async function handleTestMail() {
    setMailTesting(true)
    try {
      const res = await fetch("/api/admin/mail-config/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (res.ok) {
        toast.success("Test email sent — check your inbox.")
      } else {
        const resData = await res.json()
        toast.error(formatError(resData, "Failed to send test email."))
      }
    } finally {
      setMailTesting(false)
    }
  }

  async function handleActivate(id: string) {
    const res = await fetch(`/api/admin/mail-config/${id}/activate`, {
      method: "PATCH",
    })
    if (res.ok) {
      toast.success("Config activated.")
      loadMailConfigs()
    } else {
      const data = await res.json().catch(() => null)
      toast.error(formatError(data, "Failed to activate config."))
    }
  }

  async function handleDeleteMail() {
    if (!deleteTarget) return
    setDeleteLoading(true)
    try {
      const res = await fetch(`/api/admin/mail-config/${deleteTarget.id}`, {
        method: "DELETE",
      })
      if (res.ok) {
        toast.success("Config deleted.")
        setDeleteOpen(false)
        setDeleteTarget(null)
        loadMailConfigs()
      } else {
        const data = await res.json()
        toast.error(data.error ?? "Failed to delete config.")
      }
    } finally {
      setDeleteLoading(false)
    }
  }

  const mailColumns: DataTableColumn<MailConfig>[] = [
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

      <Card>
        <CardHeader>
          <CardTitle>Default merchant pricing</CardTitle>
          <CardDescription>
            Applied to new merchants when they register. Existing merchants are
            not affected.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="flex flex-col gap-2">
            <Label htmlFor="base-rate">Base rate (TK)</Label>
            <Input
              id="base-rate"
              type="number"
              min="0"
              step="1"
              value={baseRate}
              onChange={(e) => setBaseRate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="extra-rate">Extra per KG (TK)</Label>
            <Input
              id="extra-rate"
              type="number"
              min="0"
              step="1"
              value={extraRatePerKg}
              onChange={(e) => setExtraRatePerKg(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="free-weight">Free weight (KG)</Label>
            <Input
              id="free-weight"
              type="number"
              min="0"
              step="0.1"
              value={freeWeightKg}
              onChange={(e) => setFreeWeightKg(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="max-weight">Max weight (KG)</Label>
            <Input
              id="max-weight"
              type="number"
              min="0.1"
              step="0.1"
              value={maxWeightKg}
              onChange={(e) => setMaxWeightKg(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="cancellation-fee">Cancellation fee (TK)</Label>
            <Input
              id="cancellation-fee"
              type="number"
              min="0"
              step="1"
              value={cancellationFee}
              onChange={(e) => setCancellationFee(e.target.value)}
            />
          </div>
        </CardContent>
        <CardFooter className="justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving
              </>
            ) : (
              "Save defaults"
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
            loading={mailLoading}
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
