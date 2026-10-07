"use client"

import { History, Loader2, Save, Send } from "lucide-react"
import { useEffect, useState } from "react"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { LabelRenderer } from "@/components/label-renderer"
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
import { LabelBlockEditor } from "@/features/platform-config/components/label-block-editor"
import {
  type LabelTemplateSaveInput,
  useLabelTemplates,
} from "@/features/platform-config/hooks/use-label-template"
import { LABEL_TEMPLATE_MAX_MM, LABEL_TEMPLATE_MIN_MM } from "@/lib/constants"
import { formatDateTime } from "@/lib/format"
import { DEFAULT_LABEL_TEMPLATE, SAMPLE_LABEL_DATA } from "@/lib/label-layout"
import { toast } from "@/lib/notify"

// The sample order values, plus the platform's real identity so the preview's
// brand-name / website / icon blocks show what will actually print.
const PREVIEW_DATA = {
  ...SAMPLE_LABEL_DATA,
  siteName: siteConfig.name,
  siteUrl: siteConfig.siteUrl,
}

// =============================================================================
// Label designer (R5)
//
// Design / Preview / Publish, one platform-wide parcel label. Everything the
// admin composes is stored as the block array the renderer already consumes, so
// the preview is not an approximation — it is the same component, at the same
// physical millimetre sizes, that prints.
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
        blocks: LabelTemplateSaveInput["blocks"]
      }
    | null
    | undefined,
): LabelTemplateSaveInput {
  if (source) {
    return {
      name: source.name,
      widthMm: source.widthMm,
      heightMm: source.heightMm,
      logoRef: source.logoRef,
      blocks: source.blocks,
    }
  }
  return {
    name: DEFAULT_NAME,
    widthMm: DEFAULT_LABEL_TEMPLATE.widthMm,
    heightMm: DEFAULT_LABEL_TEMPLATE.heightMm,
    logoRef: null,
    blocks: DEFAULT_LABEL_TEMPLATE.blocks,
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
        <div className="grid gap-4 lg:grid-cols-[1fr_minmax(0,26rem)]">
          <Skeleton className="h-96 w-full" />
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
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
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
                        value={form.widthMm}
                        data-testid="label-width"
                        onChange={(e) =>
                          setForm({
                            ...form,
                            widthMm: Number(e.target.value) || form.widthMm,
                          })
                        }
                        onBlur={() =>
                          setForm({
                            ...form,
                            widthMm: clampDimension(form.widthMm),
                          })
                        }
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="label-height">Height (mm)</Label>
                      <Input
                        id="label-height"
                        type="number"
                        min={LABEL_TEMPLATE_MIN_MM}
                        max={LABEL_TEMPLATE_MAX_MM}
                        value={form.heightMm}
                        data-testid="label-height"
                        onChange={(e) =>
                          setForm({
                            ...form,
                            heightMm: Number(e.target.value) || form.heightMm,
                          })
                        }
                        onBlur={() =>
                          setForm({
                            ...form,
                            heightMm: clampDimension(form.heightMm),
                          })
                        }
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
                    <CardTitle>Blocks</CardTitle>
                    <CardDescription>
                      The label is a top-to-bottom stack. Every block is
                      constrained to what the renderer and a scanner can handle.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <LabelBlockEditor
                      blocks={form.blocks}
                      onChange={(blocks) => setForm({ ...form, blocks })}
                    />
                  </CardContent>
                </Card>
              </div>

              <div className="lg:sticky lg:top-4">
                <LabelPreview
                  widthMm={form.widthMm}
                  heightMm={form.heightMm}
                  blocks={form.blocks}
                  logoRef={form.logoRef}
                  scale={1.6}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="preview">
            <Card>
              <CardHeader>
                <CardTitle>Preview</CardTitle>
                <CardDescription>
                  Sample data on the real label. It scales to fit this panel;
                  the print action always uses the true physical size.
                </CardDescription>
              </CardHeader>
              <CardContent className="py-6">
                <LabelRenderer
                  widthMm={form.widthMm}
                  heightMm={form.heightMm}
                  blocks={form.blocks}
                  data={{
                    ...PREVIEW_DATA,
                    logoUrl: form.logoRef,
                  }}
                  scale={2}
                  fit
                  data-testid="label-preview"
                />
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

function LabelPreview({
  widthMm,
  heightMm,
  blocks,
  logoRef,
  scale,
}: {
  widthMm: number
  heightMm: number
  blocks: LabelTemplateSaveInput["blocks"]
  logoRef: string | null
  scale: number
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Live preview</CardTitle>
        <CardDescription>
          {widthMm}×{heightMm}mm · sample data
        </CardDescription>
      </CardHeader>
      <CardContent className="overflow-hidden">
        <LabelRenderer
          widthMm={widthMm}
          heightMm={heightMm}
          blocks={blocks}
          data={{ ...PREVIEW_DATA, logoUrl: logoRef }}
          scale={scale}
          fit
          data-testid="label-preview-inline"
        />
      </CardContent>
    </Card>
  )
}
