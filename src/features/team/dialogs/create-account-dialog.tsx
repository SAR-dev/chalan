"use client"

import { UserPlus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { FormDialog } from "@/components/form-dialog"
import { FormErrors } from "@/components/form-errors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useTeam } from "@/features/team/hooks/use-team"
import { useWarehouses } from "@/features/warehouses/hooks/use-warehouses"
import type { Role } from "@/lib/types"
import { teamCreateSchema, validateFormData } from "@/lib/validation"

const ACCOUNT_EMAIL_PLACEHOLDER = "wahouse-admin@email.com"

type CreatableRole = Extract<Role, "WAREHOUSE_ADMIN">

const EMPTY = {
  name: "",
  email: "",
  phone: "",
  password: "",
  role: "WAREHOUSE_ADMIN" as CreatableRole,
  warehouseId: "" as string,
}

export function CreateAccountDialog({
  afterSubmit,
}: {
  afterSubmit?: () => void
}) {
  const { createAccount } = useTeam()
  const { warehouses } = useWarehouses()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Show every active warehouse so the Super Admin can always pick one. A
  // warehouse already managed by someone else is still selectable here, and the
  // server keeps `managedBy` in sync when the account is created.
  const selectableWarehouses = warehouses.filter((w) => w.isActive !== false)
  const selectedWarehouse = selectableWarehouses.find(
    (w) => w.id === form.warehouseId,
  )

  function update<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    const trimmed = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
    }

    const fieldErrors = validateFormData(teamCreateSchema, {
      ...trimmed,
      password: form.password,
      role: form.role,
      warehouseId: form.warehouseId || undefined,
    })
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
      return
    }
    setErrors({})
    setSubmitting(true)
    try {
      await createAccount({
        ...trimmed,
        password: form.password,
        role: form.role,
        warehouseId: form.warehouseId || null,
      })
      toast.success("Warehouse Admin created. Activation email sent.")
      setForm(EMPTY)
      setOpen(false)
      afterSubmit?.()
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to create the account. Please try again.",
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setForm(EMPTY)
      }}
      trigger={
        <Button data-testid="create-account-open">
          <UserPlus className="size-4" />
          Create Warehouse Admin
        </Button>
      }
      title="Create Warehouse Admin"
      description="Provision a Warehouse Admin. This role cannot self register — we email an activation link and they choose their own password."
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel="Create Warehouse Admin"
      submitTestId="create-account-submit"
      submitIcon={<UserPlus className="size-4" />}
      showCancel={false}
      fullWidthButtons
    >
      <div className="grid grid-cols-1 gap-4">
        <FormErrors errors={Object.keys(errors).length > 0 ? errors : null} />

        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Full name</Label>
          <Input
            id="name"
            data-testid="team-name"
            value={form.name}
            onChange={(e) => update("name", e.target.value)}
            placeholder="Jane Doe"
            autoComplete="name"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="warehouse">Assigned warehouse</Label>
            <Select
              value={form.warehouseId}
              onValueChange={(v) => update("warehouseId", v ?? "")}
            >
              <SelectTrigger
                id="warehouse"
                data-testid="team-warehouse"
                className="w-full"
              >
                <SelectValue placeholder="Select a warehouse">
                  {selectedWarehouse
                    ? `${selectedWarehouse.name}-${selectedWarehouse.city}`
                    : undefined}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {selectableWarehouses.length === 0 ? (
                  <SelectItem value="none" disabled>
                    No warehouses available
                  </SelectItem>
                ) : (
                  selectableWarehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.name}-{w.city}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="phone">Phone</Label>
            <Input
              id="phone"
              data-testid="team-phone"
              type="tel"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              placeholder="+8801711000000"
              autoComplete="tel"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            data-testid="team-email"
            type="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder={ACCOUNT_EMAIL_PLACEHOLDER}
            autoComplete="email"
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="password">Temporary password</Label>
          <Input
            id="password"
            data-testid="team-password"
            type="password"
            value={form.password}
            onChange={(e) => update("password", e.target.value)}
            placeholder="At least 6 characters"
            minLength={6}
            autoComplete="new-password"
          />
        </div>
      </div>
    </FormDialog>
  )
}
