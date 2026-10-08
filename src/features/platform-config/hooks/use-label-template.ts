"use client"

import type { Template } from "@pdfme/common"
import { useCallback } from "react"
import useSWR from "swr"
import { useAuth } from "@/features/account/hooks/use-auth"
import { jsonFetcher, swrOptions } from "@/lib/hooks/fetcher"
import { labelPdfmeEnabled } from "@/lib/label/config"
import { DEFAULT_LABEL_TEMPLATE_PDFME } from "@/lib/label/default-template"
import {
  DEFAULT_LABEL_TEMPLATE,
  type LabelTemplateStructure,
} from "@/lib/label-layout"
import type { LabelBlock } from "@/lib/validation"
import { formatError } from "@/lib/validation"

// =============================================================================
// Parcel label template (R5)
//
// Two readers, one source of truth:
// - `usePublishedLabelTemplate` is what every print surface uses. It reads the
//   public endpoint and falls back to the built-in `DEFAULT_LABEL_TEMPLATE`
//   before an admin has published anything, so quick-print works from day one.
// - `useLabelTemplates` is the designer's own reader/writer. It only runs for
//   Super Admins and owns the draft → publish → history lifecycle.
// =============================================================================

const PUBLISHED_KEY = "/api/label-template"
const ADMIN_KEY = "/api/admin/label-template"

/** A `label_template` row as the API returns it (timestamps are ISO strings). */
export interface LabelTemplateRecord {
  id: string
  name: string
  widthMm: number
  heightMm: number
  logoRef: string | null
  blocks: LabelBlock[]
  engine: "blocks" | "pdfme"
  template: Template | null
  version: number
  publishedAt: string | null
  isDefault: boolean
  createdAt: string
  updatedAt: string
}

type PublishedResponse = {
  name: string
  widthMm: number
  heightMm: number
  logoRef: string | null
  blocks: LabelBlock[]
  engine: "blocks" | "pdfme"
  template: Template | null
  version: number
} | null

/** The published structure, or the built-in default when none exists. */
export function usePublishedLabelTemplate(): {
  template: LabelTemplateStructure
  isLoading: boolean
} {
  const { data, isLoading } = useSWR<PublishedResponse>(
    PUBLISHED_KEY,
    jsonFetcher,
    swrOptions,
  )

  const fallback: LabelTemplateStructure = labelPdfmeEnabled()
    ? {
        ...DEFAULT_LABEL_TEMPLATE,
        engine: "pdfme",
        template: DEFAULT_LABEL_TEMPLATE_PDFME,
      }
    : DEFAULT_LABEL_TEMPLATE

  return {
    template: data
      ? {
          widthMm: data.widthMm,
          heightMm: data.heightMm,
          blocks: data.blocks,
          logoRef: data.logoRef,
          engine: data.engine,
          template: data.template,
        }
      : fallback,
    isLoading,
  }
}

export interface LabelTemplateSaveInput {
  name: string
  widthMm: number
  heightMm: number
  logoRef: string | null
  blocks: LabelBlock[]
  engine?: "blocks" | "pdfme"
  template?: Template | null
}

type Result = { ok: boolean; error?: string }
type SaveResult = Result & { id?: string }

/** The designer's reader plus the draft → publish → history lifecycle. */
export function useLabelTemplates() {
  const { currentUser } = useAuth()
  const isSuperAdmin = currentUser?.role === "SUPER_ADMIN"

  const { data, error, isLoading, isValidating, mutate } = useSWR<{
    draft: LabelTemplateRecord | null
    published: LabelTemplateRecord | null
    versions: LabelTemplateRecord[]
  }>(isSuperAdmin ? ADMIN_KEY : null, jsonFetcher, swrOptions)

  /**
   * Saves the working draft. Creates it the first time, edits it after — the
   * designer is one continuous document, not a list of saves.
   */
  const saveDraft = useCallback(
    async (input: LabelTemplateSaveInput): Promise<SaveResult> => {
      const draftId = data?.draft?.id
      const res = await fetch(draftId ? `${ADMIN_KEY}/${draftId}` : ADMIN_KEY, {
        method: draftId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(body, "Could not save the draft."),
        }
      }
      await mutate()
      return { ok: true, id: body?.id ?? draftId }
    },
    [data?.draft?.id, mutate],
  )

  /** Appends a new published version from the draft. */
  const publish = useCallback(
    async (id: string): Promise<Result> => {
      const res = await fetch(`${ADMIN_KEY}/${id}/publish`, { method: "POST" })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(body, "Could not publish the template."),
        }
      }
      await mutate()
      return { ok: true }
    },
    [mutate],
  )

  const discardDraft = useCallback(
    async (id: string): Promise<Result> => {
      const res = await fetch(`${ADMIN_KEY}/${id}`, { method: "DELETE" })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        return {
          ok: false,
          error: formatError(body, "Could not discard the draft."),
        }
      }
      await mutate()
      return { ok: true }
    },
    [mutate],
  )

  return {
    draft: data?.draft ?? null,
    published: data?.published ?? null,
    versions: data?.versions ?? [],
    isLoading,
    isRefreshing: isValidating,
    error,
    refresh: mutate,
    saveDraft,
    publish,
    discardDraft,
  }
}
