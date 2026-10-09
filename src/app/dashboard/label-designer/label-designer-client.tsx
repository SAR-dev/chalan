"use client"

import { History, Loader2, Save, Send } from "lucide-react"
import dynamic from "next/dynamic"
import { useEffect, useState } from "react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { PageHeader } from "@/components/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { pageContent } from "@/config/content"
import { siteConfig } from "@/config/site"
import { useAuth } from "@/features/account/hooks/use-auth"
import {
  type LabelTemplateSaveInput,
  useLabelTemplates,
} from "@/features/platform-config/hooks/use-label-template"
import {
  LABEL_DEFAULT_HEIGHT_MM,
  LABEL_DEFAULT_WIDTH_MM,
  LABEL_TEMPLATE_MAX_MM,
  LABEL_TEMPLATE_MIN_MM,
} from "@/lib/constants"
import { formatDateTime } from "@/lib/format"
import { DEFAULT_LABEL_TEMPLATE_PDFME } from "@/lib/label/default-template"
import { buildLabelInputs } from "@/lib/label/label-inputs"
import { SAMPLE_LABEL_DATA } from "@/lib/label-layout"
import { toast } from "@/lib/notify"

// The pdfme canvas/preview are heavy (pdfium, font machinery): load them as
// separate chunks that only fetch when this screen needs them.
const PdfmeDesigner = dynamic(
  () =>
    import("@/features/platform-config/components/pdfme-designer").then(
      (m) => m.PdfmeDesigner,
    ),
  { ssr: false },
)
const PdfmeViewer = dynamic(
  () =>
    import("@/features/platform-config/components/pdfme-viewer").then(
      (m) => m.PdfmeViewer,
    ),
  { ssr: false },
)

// The sample order values, plus the platform's real identity so the preview's
// brand-name / website / icon blocks show what will actually print.
const PREVIEW_DATA = {
  ...SAMPLE_LABEL_DATA,
  siteName: siteConfig.name,
  siteUrl: siteConfig.siteUrl,
}

// =============================================================================
// Label designer (R5, pdfme — PDF.md)
//
// Design / Preview / Publish, one platform-wide parcel label. The designer is
// the pdfme free canvas: elements are placed in millimetres and the Preview
// tab renders them through the same engine the print action generates with —
// the preview is not an approximation.
//
// Saving writes a draft; publishing appends a new immutable version. The live
// print path reads the newest published version, falling back to the built-in
// default until one exists.
// =============================================================================

type DesignerTab = "design" | "preview" | "history"

const DEFAULT_NAME = "Default parcel label"

function formFrom(
  source:
    | {
        name: string
        widthMm: number
        heightMm: number
        logoRef: string | null
        template?: LabelTemplateSaveInput["template"]
      }
    | null
    | undefined,
): LabelTemplateSaveInput {
  // A pdfme draft/version round-trips as-is; its paper size comes from basePdf.
  if (source?.template) {
    const bp = source.template.basePdf
    const widthMm =
      typeof bp === "object" && "width" in bp ? bp.width : source.widthMm
    const heightMm =
      typeof bp === "object" && "height" in bp ? bp.height : source.heightMm
    return {
      name: source.name,
      widthMm,
      heightMm,
      logoRef: source.logoRef,
      template: source.template,
    }
  }
  // The canvas *is* the editor. Seed from the built-in pdfme label.
  const bp = DEFAULT_LABEL_TEMPLATE_PDFME.basePdf
  const widthMm =
    typeof bp === "object" && "width" in bp ? bp.width : LABEL_DEFAULT_WIDTH_MM
  const heightMm =
    typeof bp === "object" && "height" in bp
      ? bp.height
      : LABEL_DEFAULT_HEIGHT_MM
  return {
    name: source?.name ?? DEFAULT_NAME,
    widthMm,
    heightMm,
    logoRef: source?.logoRef ?? null,
    template: DEFAULT_LABEL_TEMPLATE_PDFME,
  }
}

function clampDimension(value: number): number {
  return Math.min(
    Math.max(Math.round(value), LABEL_TEMPLATE_MIN_MM),
    LABEL_TEMPLATE_MAX_MM,
  )
}

export function LabelDesignerPageClient() {
  const { currentUser } = useAuth()
  const { draft, published, versions, isLoading, saveDraft, publish } =
    useLabelTemplates()

  const [tab, setTab] = useState<DesignerTab>("design")
  const [form, setForm] = useState<LabelTemplateSaveInput | null>(null)
  // Raw text for the two dimension inputs. `Number("") || value` used to snap a
  // cleared field straight back to its old number, so retyping one meant
  // selecting the whole field first. Holding the raw string lets the input go
  // empty and be retyped; `null` means "show the stored value".
  const [dimensionDraft, setDimensionDraft] = useState<{
    field: "widthMm" | "heightMm"
    text: string
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [publishOpen, setPublishOpen] = useState(false)

  // Seed the editor once auth has resolved *and* the current draft (or the live
  // version) has loaded. Waiting on auth matters: the SWR key is null until the
  // role is known, and seeding then would overwrite a saved draft with the
  // built-in default. After the first seed the editor is the source of truth
  // until reload, so a background revalidation never yanks typed edits away.
  const seedReady = currentUser?.role === "SUPER_ADMIN" && !isLoading

  useEffect(() => {
    if (form !== null || !seedReady) return
    setForm(formFrom(draft ?? published))
  }, [form, seedReady, draft, published])

  // The size inputs and the pdfme paper size are two views of one number
  // (PDF.md §5 rule 7 writes widthMm/heightMm from basePdf on save, so the
  // inputs must write into basePdf too).
  useEffect(() => {
    if (!form?.template) return
    const bp = form.template.basePdf
    if (typeof bp !== "object" || !("width" in bp)) return
    if (bp.width === form.widthMm && bp.height === form.heightMm) return
    setForm({
      ...form,
      template: {
        ...form.template,
        basePdf: { ...bp, width: form.widthMm, height: form.heightMm },
      },
    })
  }, [form])

  function handleDesignerChange(
    next: NonNullable<LabelTemplateSaveInput["template"]>,
  ): void {
    setForm((current) => {
      if (!current) return current
      const bp = next.basePdf
      return {
        ...current,
        template: next,
        widthMm:
          typeof bp === "object" && "width" in bp ? bp.width : current.widthMm,
        heightMm:
          typeof bp === "object" && "height" in bp
            ? bp.height
            : current.heightMm,
      }
    })
  }

  async function handleSave(): Promise<string | null> {
    if (!form) return null
    setSaving(true)
    const res = await saveDraft(form)
    setSaving(false)
    if (!res.ok) {
      toast.error(res.error ?? "Could not save the draft.")
      return null
    }
    toast.success("Draft saved.")
    return res.id ?? null
  }

  async function handlePublish() {
    setPublishing(true)
    // Publishing always persists the current editor first, so "publish" can
    // never ship a version older than what is on screen.
    const id = await handleSave()
    if (!id) {
      setPublishing(false)
      setPublishOpen(false)
      return
    }
    const res = await publish(id)
    setPublishing(false)
    setPublishOpen(false)
    if (res.ok) {
      toast.success("Published. New labels use this version.")
    } else {
      toast.error(res.error ?? "Could not publish the label.")
    }
  }

  const busy = saving || publishing

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={pageContent.dashboard.labelDesigner.title}
        description={pageContent.dashboard.labelDesigner.description}
      >
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={busy || form === null}
            data-testid="label-save-draft"
            onClick={() => {
              void handleSave()
            }}
          >
            {saving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            Save draft
          </Button>
          <Button
            data-testid="label-publish"
            disabled={busy || form === null}
            onClick={() => setPublishOpen(true)}
          >
            <Send className="size-4" />
            Publish
          </Button>
        </div>
      </PageHeader>

      {form === null ? (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-44 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : (
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as DesignerTab)}
          data-testid="label-designer-tabs"
        >
          <TabsList>
            <TabsTrigger value="design" data-testid="label-tab-design">
              Design
            </TabsTrigger>
            <TabsTrigger value="preview" data-testid="label-tab-preview">
              Preview
            </TabsTrigger>
            <TabsTrigger value="history" data-testid="label-tab-history">
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="design">
            <div className="flex flex-col gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Label size</CardTitle>
                  <CardDescription>
                    The physical sheet the label prints on, in millimetres.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <Label htmlFor="label-name">Template name</Label>
                    <Input
                      id="label-name"
                      value={form.name}
                      data-testid="label-name"
                      maxLength={80}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="label-width">Width (mm)</Label>
                    <Input
                      id="label-width"
                      type="number"
                      min={LABEL_TEMPLATE_MIN_MM}
                      max={LABEL_TEMPLATE_MAX_MM}
                      value={
                        dimensionDraft?.field === "widthMm"
                          ? dimensionDraft.text
                          : form.widthMm
                      }
                      data-testid="label-width"
                      onChange={(e) => {
                        const text = e.target.value
                        setDimensionDraft({ field: "widthMm", text })
                        const next = Number(text)
                        setForm({
                          ...form,
                          widthMm:
                            text !== "" && Number.isFinite(next)
                              ? next
                              : form.widthMm,
                        })
                      }}
                      onBlur={() => {
                        setDimensionDraft(null)
                        setForm({
                          ...form,
                          widthMm: clampDimension(form.widthMm),
                        })
                      }}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="label-height">Height (mm)</Label>
                    <Input
                      id="label-height"
                      type="number"
                      min={LABEL_TEMPLATE_MIN_MM}
                      max={LABEL_TEMPLATE_MAX_MM}
                      value={
                        dimensionDraft?.field === "heightMm"
                          ? dimensionDraft.text
                          : form.heightMm
                      }
                      data-testid="label-height"
                      onChange={(e) => {
                        const text = e.target.value
                        setDimensionDraft({ field: "heightMm", text })
                        const next = Number(text)
                        setForm({
                          ...form,
                          heightMm:
                            text !== "" && Number.isFinite(next)
                              ? next
                              : form.heightMm,
                        })
                      }}
                      onBlur={() => {
                        setDimensionDraft(null)
                        setForm({
                          ...form,
                          heightMm: clampDimension(form.heightMm),
                        })
                      }}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <Label htmlFor="label-logo">Logo URL (optional)</Label>
                    <Input
                      id="label-logo"
                      value={form.logoRef ?? ""}
                      placeholder="/uploads/…"
                      data-testid="label-logo"
                      onChange={(e) =>
                        setForm({
                          ...form,
                          logoRef: e.target.value.trim() || null,
                        })
                      }
                    />
                    <p className="text-muted-foreground text-xs">
                      A logo block renders this image; it is ignored if unset.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Canvas</CardTitle>
                  <CardDescription>
                    A free canvas in millimetres. Drag elements anywhere; add
                    bound fields from the palette. The QR stays scannable
                    (≥30mm) by construction.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {form.template ? (
                    <PdfmeDesigner
                      template={form.template}
                      onChange={handleDesignerChange}
                    />
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="preview">
            <Card>
              <CardHeader>
                <CardTitle>Preview</CardTitle>
                <CardDescription>
                  Sample data rendered through the PDF engine — the same
                  generator the print action uses.
                </CardDescription>
              </CardHeader>
              <CardContent className="py-6">
                {form.template ? (
                  <PdfmeViewer
                    template={form.template}
                    inputs={buildLabelInputs(form.template, PREVIEW_DATA)}
                    testId="label-preview"
                  />
                ) : null}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle>Version history</CardTitle>
                <CardDescription>
                  Published versions are immutable — a parcel can always be
                  reprinted with the label it shipped with.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {versions.length === 0 ? (
                  <p className="text-muted-foreground text-sm">
                    Nothing published yet. The print action falls back to the
                    built-in default until you publish.
                  </p>
                ) : (
                  versions.map((version) => (
                    <div
                      key={version.id}
                      data-testid={`label-version-${version.version}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <History className="text-muted-foreground size-4 shrink-0" />
                        <span className="truncate text-sm font-medium">
                          v{version.version} · {version.name}
                        </span>
                        {version.id === published?.id && (
                          <Badge variant="secondary">Live</Badge>
                        )}
                      </div>
                      <div className="text-muted-foreground flex items-center gap-3 text-xs">
                        <span>
                          {version.widthMm}×{version.heightMm}mm
                        </span>
                        <span>
                          {version.publishedAt
                            ? formatDateTime(version.publishedAt)
                            : "—"}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          data-testid={`label-version-load-${version.version}`}
                          onClick={() => {
                            setForm(formFrom(version))
                            setTab("design")
                            toast.success(
                              `Loaded v${version.version} into the editor.`,
                            )
                          }}
                        >
                          Load
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <ConfirmDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title="Publish this label?"
        description="Every warehouse admin and rider will print this version from now on. The previous version stays in history for reprints."
        confirmLabel="Publish"
        loading={publishing}
        onConfirm={handlePublish}
      />
    </div>
  )
}
