"use client"

import { markdown } from "@codemirror/lang-markdown"
import { EditorView, keymap } from "@codemirror/view"
import CodeMirror from "@uiw/react-codemirror"
import { Bold, Heading2, Italic, List } from "lucide-react"
import { useTheme } from "next-themes"
import { useEffect, useRef, useState } from "react"
import { Markdown } from "@/components/markdown"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

/**
 * Markdown source editor with a live preview, shared by the create and edit
 * announcement pages.
 *
 * The Write pane is CodeMirror 6 (markdown highlighting, line numbers,
 * Ctrl/Cmd+B · Ctrl/Cmd+I, bracket closing); the Preview pane renders through
 * the app's own `<Markdown>` — the same renderer readers see on
 * /announcements/[id] — so what the admin previews is byte-for-byte what
 * ships. Errors are NOT rendered here: they stay frozen on submit (see
 * CONTRIBUTING "Form validation error display").
 */

/** Wrap the selection in `open`/`close`, or unwrap when already wrapped. */
function toggleInline(view: EditorView, open: string, close = open): boolean {
  const { state } = view
  const range = state.selection.main
  const selected = state.sliceDoc(range.from, range.to)

  // Empty selection: drop the marker pair with the cursor parked between
  // them, ready to type.
  if (selected === "") {
    view.dispatch({
      changes: { from: range.from, insert: open + close },
      selection: { anchor: range.from + open.length },
    })
    view.focus()
    return true
  }

  const wrapped =
    selected.startsWith(open) &&
    selected.endsWith(close) &&
    selected.length >= open.length + close.length
  const body = wrapped
    ? selected.slice(open.length, selected.length - close.length)
    : selected
  const insert = open + body + close
  // Reselect including the markers so a second press unwraps instead of
  // nesting.
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: { anchor: range.from, head: range.from + insert.length },
  })
  view.focus()
  return true
}

/** Prefix every line in the selection, or strip the prefix when all have it. */
function toggleLinePrefix(view: EditorView, prefix: string): boolean {
  const { state } = view
  const range = state.selection.main
  const first = state.doc.lineAt(range.from)
  const last = state.doc.lineAt(range.to)
  const lines: Array<{ from: number }> = []
  for (let n = first.number; n <= last.number; n++) {
    lines.push(state.doc.line(n))
  }
  const hasPrefix = (line: { from: number }) =>
    state.sliceDoc(line.from, line.from + prefix.length) === prefix
  const changes = lines.every(hasPrefix)
    ? lines.map((l) => ({
        from: l.from,
        to: l.from + prefix.length,
        insert: "",
      }))
    : lines
        .filter((l) => !hasPrefix(l))
        .map((l) => ({ from: l.from, insert: prefix }))
  if (changes.length > 0) view.dispatch({ changes })
  view.focus()
  return true
}

// Returning true also suppresses the browser's native contenteditable
// bold/italic, which would inject HTML the markdown source can't represent.
const sourceKeymap = keymap.of([
  { key: "Mod-b", run: (view) => toggleInline(view, "**") },
  { key: "Mod-i", run: (view) => toggleInline(view, "*") },
])

// CM6 draws its own focus outline by default; the wrapper's focus-within ring
// matches the rest of the app's form controls, so drop the duplicate.
const focusRing = EditorView.theme({ "&.cm-focused": { outline: "none" } })

// Module-level: all three are stable extensions, created once (SSR-safe —
// nothing touches the DOM until an editor mounts).
const sourceExtensions = [markdown(), sourceKeymap, focusRing]

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
  const viewRef = useRef<EditorView | null>(null)
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Toolbar actions need the live view; onCreateEditor hands it over once.
  const act = (fn: (view: EditorView) => boolean) => {
    if (viewRef.current) fn(viewRef.current)
  }

  return (
    <div className="flex flex-col gap-3">
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
          <div
            role="toolbar"
            aria-label={`${label} formatting`}
            className="border-input mb-1.5 flex w-fit gap-3 rounded-md border p-0.5"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Bold"
              onClick={() => act((v) => toggleInline(v, "**"))}
            >
              <Bold />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Italic"
              onClick={() => act((v) => toggleInline(v, "*"))}
            >
              <Italic />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Heading"
              onClick={() => act((v) => toggleLinePrefix(v, "## "))}
            >
              <Heading2 />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Bulleted list"
              onClick={() => act((v) => toggleLinePrefix(v, "- "))}
            >
              <List />
            </Button>
          </div>
          <CodeMirror
            id={id}
            data-testid={id}
            aria-label={label}
            className="overflow-hidden rounded-lg border border-input focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
            value={value}
            onChange={onChange}
            // oneDark in dark mode; before mount always light to avoid a
            // hydration flash (same guard as ThemeToggle).
            theme={mounted && resolvedTheme === "dark" ? "dark" : "light"}
            extensions={sourceExtensions}
            height="12rem"
            placeholder={
              placeholder ??
              "Markdown supported: **bold**, *italic*, # headings, - lists, [links](https://…)."
            }
            onCreateEditor={(editor) => {
              viewRef.current = editor
            }}
          />
        </TabsContent>
        <TabsContent value="preview">
          {/* Height matches the source pane so switching tabs doesn't jump. */}
          <div
            data-testid={`${id}-preview`}
            className="border-input min-h-48 rounded-md border px-3 py-2"
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
