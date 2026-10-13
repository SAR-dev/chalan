import { describe, expect, it } from "vitest"
import { slugifyHeading, tocFromMarkdown } from "@/lib/help-toc"

const GUIDE = `# Merchant guide

Intro paragraph.

## 1. Register and verify your account

Steps.

## 2. Set up your business profile and pickup locations

More steps.

### A nested heading

Should not appear.
`

describe("slugifyHeading", () => {
  it("produces the same anchors GitHub does", () => {
    expect(slugifyHeading("1. Register and verify your account")).toBe(
      "1-register-and-verify-your-account",
    )
  })

  it("strips markdown emphasis before slugging", () => {
    // The heading renderer receives children, not the source text, so a heading
    // written as `**Cancel** an order` has to resolve the same as its label.
    expect(slugifyHeading("**Cancel** an order")).toBe("cancel-an-order")
  })

  it("keeps non-ascii letters", () => {
    // Dropping them would make every non-english heading anchor empty.
    expect(slugifyHeading("Cấu hình khu vực")).toBe("cấu-hình-khu-vực")
  })
})

describe("tocFromMarkdown", () => {
  it("collects the numbered sections in document order", () => {
    expect(tocFromMarkdown(GUIDE).map((e) => e.label)).toEqual([
      "1. Register and verify your account",
      "2. Set up your business profile and pickup locations",
    ])
  })

  it("skips h3, which would triple the list on the API page", () => {
    expect(tocFromMarkdown(GUIDE).some((e) => e.label.includes("nested"))).toBe(
      false,
    )
  })

  it("skips the h1 and any prose", () => {
    const labels = tocFromMarkdown(GUIDE).map((e) => e.label)
    expect(labels).not.toContain("Merchant guide")
    expect(labels).not.toContain("Intro paragraph.")
  })

  it("returns nothing for a guide with no sections", () => {
    expect(tocFromMarkdown("# Title\n\nJust prose.")).toEqual([])
  })

  it("gives every entry an id the heading renderer will emit", () => {
    // The whole feature depends on these matching; a mismatch is a TOC of dead
    // links, which is worse than rendering no TOC at all.
    for (const entry of tocFromMarkdown(GUIDE)) {
      expect(entry.id).toBe(slugifyHeading(entry.label))
      expect(entry.id).not.toBe("")
    }
  })
})
