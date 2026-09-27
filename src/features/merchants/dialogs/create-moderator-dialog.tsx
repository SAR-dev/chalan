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
  type ModeratorAccount,
  useMerchantModerators,
} from "@/features/merchants/hooks/use-merchant-moderators"
import { merchantGrantableNavItems } from "@/lib/nav-config"

const GRANTABLE = merchantGrantableNavItems()

function slug(href: string) {
  return href.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "")
}

export function CreateModeratorDialog({
  merchantId,
  disabled,
  disabledReason,
  onCreated,
}: {
  merchantId: string
  disabled?: boolean
  disabledReason?: string
  onCreated?: (moderator: ModeratorAccount) => void
}) {
  const { createModerator } = useMerchantModerators(merchantId)
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  // Default grant: every grantable section checked (owner unchecks).
  const [granted, setGranted] = useState<string[]>(() =>
    GRANTABLE.map((i) => i.href),
  )
  const [errors, setErrors] = useState<Record<string, string>>({})

  function toggle(href: string) {
    setGranted((prev) =>
      prev.includes(href) ? prev.filter((h) => h !== href) : [...prev, href],
    )
  }

  function reset() {
    setName("")
    setEmail("")
    setPassword("")
    setGranted(GRANTABLE.map((i) => i.href))
    setErrors({})
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fieldErrors: Record<string, string> = {}
    if (!name.trim()) fieldErrors.name = "Name is required"
    if (!email.trim()) fieldErrors.email = "Email is required"
    if (password.length < 8)
      fieldErrors.password = "Password must be at least 8 characters"
    if (granted.length === 0)
      fieldErrors.grants = "Grant access to at least one section"
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
      return
    }
    setErrors({})
    setSubmitting(true)
    try {
      const result = await createModerator({
        name: name.trim(),
        email: email.trim(),
        password,
        permissions: granted,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Activation email sent to ${email.trim()}.`)
      onCreated?.(result.data as ModeratorAccount)
      reset()
      setOpen(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
      trigger={
        <Button
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          data-testid="add-moderator"
        >
          <UserPlus className="size-4" />
          Add moderator
        </Button>
      }
      title="Add moderator"
      description="Create a staff login for your own team. We email an activation link — they choose their own password when they click it."
      size="lg"
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel="Create moderator"
      submitIcon={<UserPlus className="size-4" />}
      submitTestId="create-moderator-submit"
      showCancel={false}
    >
      <div className="flex flex-col gap-4">
        <FormErrors errors={Object.keys(errors).length > 0 ? errors : null} />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="moderator-name">Full name</Label>
            <Input
              id="moderator-name"
              data-testid="moderator-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jane Doe"
              autoComplete="name"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="moderator-email">Email</Label>
            <Input
              id="moderator-email"
              data-testid="moderator-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="staff@yourbusiness.com"
              autoComplete="email"
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="moderator-password">Temporary password</Label>
          <Input
            id="moderator-password"
            data-testid="moderator-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            minLength={8}
            autoComplete="new-password"
          />
          <p className="text-muted-foreground text-xs">
            They replace it with their own password on activation.
          </p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Access</legend>
          <p className="text-muted-foreground text-xs">
            Checked sections appear in their sidebar. Business Settings is never
            included — that stays yours.
          </p>
          <div
            className="grid grid-cols-1 gap-2 sm:grid-cols-2"
            data-testid="grant-checkboxes"
          >
            {GRANTABLE.map((item) => (
              <label
                key={item.href}
                htmlFor={`grant-${slug(item.href)}`}
                className="border-border hover:bg-accent flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors"
              >
                <input
                  id={`grant-${slug(item.href)}`}
                  data-testid={`grant-${slug(item.href)}`}
                  type="checkbox"
                  className="size-4 cursor-pointer accent-[var(--primary)]"
                  checked={granted.includes(item.href)}
                  onChange={() => toggle(item.href)}
                />
                {item.label}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
    </FormDialog>
  )
}
