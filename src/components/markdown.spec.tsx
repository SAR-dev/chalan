// @vitest-environment jsdom

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Markdown } from "@/components/markdown"
import { tocFromMarkdown } from "@/lib/help-toc"

/**
 * The guides render through this component, and it had no styling for the
 * elements an API reference is mostly made of. `@tailwindcss/typography` is not
 * a dependency, so the `prose` classes it used to carry resolved to nothing:
 * `pre` had `overflow-x: visible` and no background, which pushed a long curl
 * example to 1024px wide on a 390px viewport and scrolled the whole page
 * sideways.
 */
function renderMd(md: string) {
  return render(<Markdown content={md} />).container
}

describe("Markdown", () => {
  it("styles fenced code as a scrollable panel", () => {
    const pre = renderMd(
      "```bash\ncurl -X POST https://example.test\n```",
    ).querySelector("pre")

    expect(pre).not.toBeNull()
    // The panel scrolls inside itself; `visible` is what let it widen the page.
    expect(pre!.className).toContain("overflow-x-auto")
    expect(pre!.className).toContain("bg-muted")
  })

  it("styles inline code, which previously had no background at all", () => {
    const code = renderMd("Send `chl_live_…` as a bearer token.").querySelector(
      "code",
    )

    expect(code).not.toBeNull()
    expect(code!.className).toContain("bg-muted")
    expect(code!.className).toContain("rounded")
  })

  it("does not double-style code inside a fence", () => {
    // `pre` owns the panel. Giving the inner `code` a background as well paints
    // a second box inside the first.
    const pre = renderMd("```bash\necho hi\n```").querySelector("pre")!
    const inner = pre.querySelector("code")

    expect(inner!.className).not.toContain("bg-muted")
    expect(inner!.className).toContain("font-mono")
  })

  it("gives headings the anchors the table of contents links to", () => {
    const md = "## 5. Configure zones and pricing\n\nBody."
    const h2 = renderMd(md).querySelector("h2")

    const [entry] = tocFromMarkdown(md)
    expect(entry).toBeDefined()
    // A TOC whose links resolve to nothing is worse than no TOC.
    expect(h2!.getAttribute("id")).toBe(entry.id)
  })

  it("keeps internal links in the tab and sends external ones out", () => {
    const container = renderMd(
      "[Warehouse guide](/help/warehouse-admin) and [spec](https://example.test/openapi).",
    )
    const [internal, external] = [...container.querySelectorAll("a")]

    // Opening a cross-guide link in a new tab loses the reader's place.
    expect(internal!.getAttribute("target")).toBeNull()
    expect(internal!.getAttribute("href")).toBe("/help/warehouse-admin")
    expect(external!.getAttribute("target")).toBe("_blank")
    expect(external!.getAttribute("rel")).toBe("noopener noreferrer")
  })

  it("styles blockquotes, which the merchant guide uses for callouts", () => {
    const quote = renderMd("> Booking several parcels at once?").querySelector(
      "blockquote",
    )
    expect(quote!.className).toContain("border-l-4")
  })

  it("wraps tables so a wide one scrolls instead of overflowing", () => {
    const table = renderMd("| a | b |\n| - | - |\n| 1 | 2 |").querySelector(
      "table",
    )
    expect(table).not.toBeNull()
    expect(table!.parentElement!.className).toContain("overflow-x-auto")
  })

  it("emits no dead prose classes", () => {
    // They resolved to nothing because the typography plugin is not installed,
    // so their presence only ever misled whoever read this file next.
    expect(renderMd("Body.").innerHTML).not.toContain("prose")
  })
})

describe("every shipped guide", () => {
  const files = ["merchant", "rider", "warehouse-admin", "admin", "api"]
  const read = (slug: string) =>
    readFileSync(
      join(process.cwd(), "src", "content", "docs", `${slug}.md`),
      "utf-8",
    )

  it("has a contents list with an anchor for every section heading", () => {
    for (const slug of files) {
      const md = read(slug)
      const entries = tocFromMarkdown(md)
      const { container } = render(<Markdown content={md} />)

      for (const entry of entries) {
        expect(
          container.querySelector(`h2#${CSS.escape(entry.id)}`),
          `${slug}.md is missing an anchor for "${entry.label}"`,
        ).not.toBeNull()
      }
    }
  })

  it("no longer promises an announcement banner that no longer exists", () => {
    // The banner was removed; announcements now surface through the bell in the
    // top bar. Telling a merchant to look for something the app stopped
    // rendering sends them looking for it.
    for (const slug of files) {
      expect(read(slug), `${slug}.md still describes a banner`).not.toMatch(
        /banner/i,
      )
    }
  })

  it("states the merchant cancellation window the code enforces", () => {
    // `merchantAllowed` in transitions.ts is PENDING, APPROVED, OUT_FOR_PICKUP.
    // The guide said two of the three, which sends a merchant to try cancelling
    // an order the app will refuse. `[\\s\\S]` rather than the `s` flag: the
    // project targets ES6, where dotAll is not available.
    expect(read("merchant")).toMatch(
      /Out for pickup[\s\S]*\(a reason is required\)/,
    )
  })
})
