"use client"

import { Megaphone } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { FormDialog } from "@/components/form-dialog"
import { FormErrors } from "@/components/form-errors"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { MarkdownEditor } from "@/features/announcements/dialogs/markdown-editor"
import { useAnnouncements } from "@/features/announcements/hooks/use-announcements"
import { ANNOUNCEMENT_TARGET_ROLE_LABELS } from "@/lib/constants"
import {
  announcementCreateSchema,
  announcementRoles,
  validateFormData,
} from "@/lib/validation"

const EMPTY = {
  title: "",
  content: "",
  publishedAt: "",
  expiresAt: "",
  isActive: true,
  targetRoles: [] as string[],
}

export function CreateAnnouncementDialog() {
  const { createAnnouncement } = useAnnouncements()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})

  function update<K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function toggleRole(role: string) {
    setForm((prev) => ({
      ...prev,
      targetRoles: prev.targetRoles.includes(role)
        ? prev.targetRoles.filter((r) => r !== role)
        : [...prev.targetRoles, role],
    }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const fieldErrors = validateFormData(announcementCreateSchema, {
      title: form.title.trim(),
      content: form.content.trim(),
      publishedAt: form.publishedAt
        ? new Date(form.publishedAt).toISOString()
        : null,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      isActive: form.isActive,
      targetRoles: form.targetRoles,
    })
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
      return
    }
    setErrors({})
    setSubmitting(true)
    const res = await createAnnouncement({
      title: form.title.trim(),
      content: form.content.trim(),
      publishedAt: form.publishedAt || null,
      expiresAt: form.expiresAt || null,
      isActive: form.isActive,
      targetRoles: form.targetRoles,
    })
    setSubmitting(false)
    if (!res.ok) {
      toast.error(res.error ?? "Could not create the announcement.")
      return
    }
    toast.success(`Announcement "${form.title.trim()}" created.`)
    setForm(EMPTY)
    setOpen(false)
  }

  return (
    <FormDialog
      size={"xl"}
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setForm(EMPTY)
      }}
      trigger={
        <Button>
          <Megaphone className="size-4" />
          New announcement
        </Button>
      }
      title="New announcement"
      description="Create a platform announcement visible to the selected roles."
      onSubmit={handleSubmit}
      submitting={submitting}
      submitLabel="Create announcement"
      submitDisabled={
        !form.title.trim() ||
        !form.content.trim() ||
        form.targetRoles.length === 0
      }
    >
      <div className="grid grid-cols-1 gap-4">
        <FormErrors errors={Object.keys(errors).length > 0 ? errors : null} />

        <div className="flex flex-col gap-2">
          <Label htmlFor="ann-title">Title</Label>
          <Input
            id="ann-title"
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            placeholder="e.g. System maintenance on Sunday"
            autoFocus
          />
        </div>

        <MarkdownEditor
          id="ann-content"
          label="Content"
          value={form.content}
          onChange={(v) => update("content", v)}
          placeholder="Write the announcement body here…"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="ann-published-at">Publish date (optional)</Label>
            <Input
              id="ann-published-at"
              type="datetime-local"
              value={form.publishedAt}
              onChange={(e) => update("publishedAt", e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Leave blank to save as draft.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="ann-expires-at">Expiry date (optional)</Label>
            <Input
              id="ann-expires-at"
              type="datetime-local"
              value={form.expiresAt}
              onChange={(e) => update("expiresAt", e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              Leave blank for no expiry.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Label>Target roles</Label>
          <div className="flex flex-wrap gap-2">
            {announcementRoles.map((role) => {
              const active = form.targetRoles.includes(role)
              return (
                <button
                  key={role}
                  type="button"
                  onClick={() => toggleRole(role)}
                  className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-foreground/40"
                  }`}
                >
                  {ANNOUNCEMENT_TARGET_ROLE_LABELS[role]}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Switch
            id="ann-active"
            checked={form.isActive}
            onCheckedChange={(v) => update("isActive", v)}
          />
          <Label htmlFor="ann-active">Active</Label>
        </div>
      </div>
    </FormDialog>
  )
}
