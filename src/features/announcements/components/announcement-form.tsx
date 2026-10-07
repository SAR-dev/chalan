"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import { Field } from "@/components/field"
import { FormErrors } from "@/components/form-errors"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { MarkdownEditor } from "@/features/announcements/components/markdown-editor"
import { useAnnouncements } from "@/features/announcements/hooks/use-announcements"
import { ANNOUNCEMENT_TARGET_ROLE_LABELS } from "@/lib/constants"
import { toast } from "@/lib/notify"
import type { Announcement } from "@/lib/types"
import {
  announcementCreateSchema,
  announcementRoles,
  announcementUpdateSchema,
  validateFormData,
} from "@/lib/validation"

// datetime-local inputs expect "YYYY-MM-DDTHH:mm" — strip the seconds/tz.
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return ""
  return iso.slice(0, 16)
}

const EMPTY = {
  title: "",
  content: "",
  publishedAt: "",
  expiresAt: "",
  isActive: true,
  targetRoles: [] as string[],
}

/**
 * The create/edit announcement form — one implementation behind both pages
 * (`/dashboard/announcements/new` and `/dashboard/announcements/[id]/edit`),
 * replacing the two dialogs it was extracted from. Page-level layout comes
 * from the callers; this owns fields, validation (frozen on submit), the
 * mutation, and the redirect back to the list on success.
 */
export function AnnouncementForm({
  announcement,
}: {
  announcement?: Announcement
}) {
  const router = useRouter()
  const { createAnnouncement, updateAnnouncement } = useAnnouncements()
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [form, setForm] = useState(() =>
    announcement
      ? {
          title: announcement.title,
          content: announcement.content,
          publishedAt: toLocalInput(announcement.publishedAt),
          expiresAt: toLocalInput(announcement.expiresAt),
          isActive: announcement.isActive,
          targetRoles: announcement.targetRoles ?? [],
        }
      : EMPTY,
  )

  const isEdit = announcement !== undefined

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
    // datetime-local is a local wall time; convert once, here, and send the
    // same ISO value we validated (the old create dialog validated an ISO
    // conversion but submitted the raw input — only surfaced with a filled
    // publish date).
    const payload = {
      title: form.title.trim(),
      content: form.content.trim(),
      publishedAt: form.publishedAt
        ? new Date(form.publishedAt).toISOString()
        : null,
      expiresAt: form.expiresAt ? new Date(form.expiresAt).toISOString() : null,
      isActive: form.isActive,
      targetRoles: form.targetRoles,
    }
    const fieldErrors = validateFormData(
      isEdit ? announcementUpdateSchema : announcementCreateSchema,
      payload,
    )
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors)
      return
    }
    setErrors({})
    setSubmitting(true)
    const res = isEdit
      ? await updateAnnouncement(announcement.id, payload)
      : await createAnnouncement(payload)
    setSubmitting(false)
    if (!res.ok) {
      toast.error(
        res.error ??
          (isEdit
            ? "Could not update the announcement."
            : "Could not create the announcement."),
      )
      return
    }
    toast.success(
      isEdit
        ? "Announcement updated."
        : `Announcement "${payload.title}" created.`,
    )
    router.push("/dashboard/announcements")
    router.refresh()
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
          <FormErrors errors={Object.keys(errors).length > 0 ? errors : null} />

          <Field label="Title" htmlFor="ann-title">
            <Input
              id="ann-title"
              data-testid="ann-title"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="e.g. System maintenance on Sunday"
              autoFocus
            />
          </Field>

          <MarkdownEditor
            id="ann-content"
            label="Content"
            value={form.content}
            onChange={(v) => update("content", v)}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Publish date"
              subLabel="(optional)"
              htmlFor="ann-published-at"
              hint="Leave blank to save as draft."
            >
              <Input
                id="ann-published-at"
                data-testid="ann-published-at"
                type="datetime-local"
                value={form.publishedAt}
                onChange={(e) => update("publishedAt", e.target.value)}
              />
            </Field>
            <Field
              label="Expiry date"
              subLabel="(optional)"
              htmlFor="ann-expires-at"
              hint="Leave blank for no expiry."
            >
              <Input
                id="ann-expires-at"
                data-testid="ann-expires-at"
                type="datetime-local"
                value={form.expiresAt}
                onChange={(e) => update("expiresAt", e.target.value)}
              />
            </Field>
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
                    data-testid={`ann-role-${role}`}
                    aria-pressed={active}
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

          <div className="border-border flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-end">
            {/* A disabled submit with no explanation is a dead end — say what
                is still missing (CONTRIBUTING "Form validation error display"). */}
            {(!form.title.trim() ||
              !form.content.trim() ||
              form.targetRoles.length === 0) && (
              <p className="text-muted-foreground text-xs sm:order-1">
                {!form.title.trim()
                  ? "A title is required."
                  : !form.content.trim()
                    ? "Content is required."
                    : "Pick at least one target role."}
              </p>
            )}
            <div className="flex items-center gap-2 sm:order-2">
              <Button
                type="button"
                variant="outline"
                data-testid="ann-cancel"
                onClick={() => router.push("/dashboard/announcements")}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                data-testid="ann-submit"
                disabled={
                  submitting ||
                  !form.title.trim() ||
                  !form.content.trim() ||
                  form.targetRoles.length === 0
                }
              >
                {submitting
                  ? isEdit
                    ? "Saving…"
                    : "Creating…"
                  : isEdit
                    ? "Save changes"
                    : "Create announcement"}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
