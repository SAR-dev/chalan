"use client"

import { Markdown } from "@/components/markdown"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"

/**
 * Markdown source editor with a live preview, shared by the create and edit
 * announcement dialogs (siblings — the control lives here so the two dialogs
 * can't drift apart).
 *
 * The preview is the same `<Markdown>` renderer readers see on the detail
 * page, so what the admin sees is what ships. Errors are NOT rendered here:
 * they stay frozen on submit (see CONTRIBUTING "Form validation error
 * display") — live per-keystroke validation would steal focus mid-edit.
 */
export function MarkdownEditor({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string
  label: string
  value: string
  onChange: (next: string) => void
  placeholder?: string
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Tabs defaultValue="write">
        <TabsList className="mb-2">
          <TabsTrigger value="write" data-testid={`${id}-write-tab`}>
            Write
          </TabsTrigger>
          <TabsTrigger value="preview" data-testid={`${id}-preview-tab`}>
            Preview
          </TabsTrigger>
        </TabsList>
        <TabsContent value="write">
          <Textarea
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={
              placeholder ??
              "Markdown supported: **bold**, *italic*, # headings, - lists, [links](https://…)."
            }
            className="min-h-32 font-mono text-sm"
          />
        </TabsContent>
        <TabsContent value="preview">
          {/* Min-height matches the textarea so switching tabs doesn't jump. */}
          <div
            data-testid={`${id}-preview`}
            className="border-input min-h-32 rounded-md border px-3 py-2"
          >
            {value.trim() ? (
              <Markdown content={value} />
            ) : (
              <p className="text-muted-foreground text-sm">
                Nothing to preview yet.
              </p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
