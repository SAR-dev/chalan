"use client"

import { CheckCircle2 } from "lucide-react"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { FormDialog } from "@/components/form-dialog"
import {
  type ModeratorAccount,
  useMerchantModerators,
} from "@/features/merchants/hooks/use-merchant-moderators"
import { merchantGrantableNavItems } from "@/lib/nav-config"

const GRANTABLE = merchantGrantableNavItems()

function slug(href: string) {
  return href.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "")
}

export function EditModeratorDialog({
  merchantId,
  moderator,
  onOpenChange,
}: {
  merchantId: string
  moderator: ModeratorAccount | null
  onOpenChange: (open: boolean) => void
}) {
  const { updateModerator } = useMerchantModerators(merchantId)
  const [submitting, setSubmitting] = useState(false)
  const [granted, setGranted] = useState<string[]>([])

  useEffect(() => {
    if (moderator) setGranted(moderator.permissions)
  }, [moderator])

  function toggle(href: string) {
    setGranted((prev) =>
      prev.includes(href) ? prev.filter((h) => h !== href) : [...prev, href],
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!moderator) return
    if (granted.length === 0) {
      toast.error("Grant access to at least one section.")
      return
    }
    setSubmitting(true)
    try {
      const result = await updateModerator(moderator.userId, {
        permissions: granted,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Access updated for ${moderator.name}.`)
      onOpenChange(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <FormDialog
      open={moderator !== null}
      onOpenChange={onOpenChange}
      title={`Access — ${moderator?.name ?? ""}`}
      description="Choose which sections appear in this moderator's sidebar."
      size="lg"
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel="Save access"
      submitIcon={<CheckCircle2 className="size-4" />}
      submitTestId="save-moderator-access"
      showCancel={false}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">Sections</legend>
        <div
          className="grid grid-cols-1 gap-2 sm:grid-cols-2"
          data-testid="grant-checkboxes"
        >
          {GRANTABLE.map((item) => (
            <label
              key={item.href}
              htmlFor={`edit-grant-${slug(item.href)}`}
              className="border-border hover:bg-accent flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors"
            >
              <input
                id={`edit-grant-${slug(item.href)}`}
                data-testid={`edit-grant-${slug(item.href)}`}
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
    </FormDialog>
  )
}
