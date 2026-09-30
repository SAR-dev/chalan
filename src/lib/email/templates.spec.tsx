import { describe, expect, it } from "vitest"
import { type EmailSpec, renderEmailHtml } from "@/lib/email/templates"

/**
 * These pin the properties react-email gives us that hand-written HTML did
 * not, plus the two ways it could silently regress (a missing font stack, an
 * accent leaking out of a style attribute). The copy itself is covered by
 * mail-templates.spec.ts, which drives the public template functions.
 */

const base: EmailSpec = {
  status: "Order Approved",
  greetingName: "Test Merchant",
  message: "Your order has been approved.",
  rows: [["Order Code", "ORD-001"]],
  cta: { href: "https://example.com/orders/ORD-001", label: "View dashboard" },
}

describe("renderEmailHtml", () => {
  it("emits table-based markup so Outlook can lay it out", async () => {
    const html = await renderEmailHtml(base)
    expect(html).toContain("<table")
    // No flexbox/grid: silently shipping either would collapse the layout in
    // Word-based clients, which is exactly what react-email exists to prevent.
    expect(html).not.toMatch(/display:\s*(flex|grid)/)
  })

  it("sets a font stack — react-email ships no default one", async () => {
    const html = await renderEmailHtml(base)
    expect(html).toContain("font-family:Arial, sans-serif")
  })

  it("adds the message as the inbox preview line", async () => {
    const html = await renderEmailHtml(base)
    expect(html).toContain(base.message)
  })

  it("renders the CTA as a real link, not just styled text", async () => {
    const html = await renderEmailHtml(base)
    expect(html).toContain(`href="${base.cta?.href}"`)
    expect(html).toContain(base.cta?.label as string)
  })

  it("applies the accent to the status and the button", async () => {
    const html = await renderEmailHtml({ ...base, brandColor: "#10b981" })
    // Exactly twice: the heading colour and the button background. Matching the
    // bare hex rather than `color:` — the latter is a substring of
    // `background-color:`, so it would double-count the button.
    expect(html.match(/#10b981/g) ?? []).toHaveLength(2)
    expect(html).toContain("font-size:20px")
  })

  it("never lets a rejected brand color reach the markup", async () => {
    // `isValidHexColor` is the only thing standing between a merchant-supplied
    // string and a style attribute, so an invalid one must not appear at all —
    // not even as a fragment.
    const html = await renderEmailHtml({
      ...base,
      brandColor: "red;} body{display:none",
    })
    expect(html).not.toContain("red;")
    expect(html).toContain("#2563eb")
  })

  it("escapes a hostile greeting name", async () => {
    const html = await renderEmailHtml({
      ...base,
      greetingName: '<img src=x onerror="alert(1)">',
    })
    expect(html).not.toContain("<img")
    expect(html).toContain("&lt;img")
  })

  it("omits the platform footer and rule when branding is hidden", async () => {
    const html = await renderEmailHtml({ ...base, hidePlatformBranding: true })
    expect(html).not.toContain("automated message")
    // The rule that separated the footer goes with it.
    expect(html).not.toContain("<hr")
  })

  it("keeps every fact row, including duplicate labels", async () => {
    const html = await renderEmailHtml({
      ...base,
      rows: [
        ["Item", "Widget"],
        ["Item", "Gadget"],
      ],
    })
    expect(html).toContain("Widget")
    expect(html).toContain("Gadget")
    // Two values, two rows. React separates the label from its colon with a
    // `<!-- -->` comment, so count the emphasised values, not `Item:`.
    expect(html.match(/<strong>/g) ?? []).toHaveLength(2)
  })
})
