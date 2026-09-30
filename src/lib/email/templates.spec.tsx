import { describe, expect, it } from "vitest"
import { type EmailSpec, renderEmailHtml } from "@/lib/email/templates"

/**
 * These pin the properties react-email gives us that hand-written HTML did
 * not, plus the ways it could silently regress: a missing font stack, or a
 * colour creeping back into a design that is meant to stay greyscale. The copy
 * itself is covered by mail-templates.spec.ts, which drives the public
 * template functions.
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

  it("fills the CTA with the same ink as the text", async () => {
    const html = await renderEmailHtml(base)
    // The button is the only filled element, so a black background occurs
    // exactly once. Counting the bare hex would not work: ink is now also the
    // colour of every body line, the fact values and the headline.
    expect(html.match(/background-color:#1f2937/g) ?? []).toHaveLength(1)
    expect(html).toContain("font-size:20px")
  })

  it("uses no colour outside the monochrome palette", async () => {
    // The black-and-white requirement, asserted as an allowlist rather than by
    // checking two specific spots: a new coloured element added anywhere in
    // the tree would otherwise pass every other test here.
    const html = await renderEmailHtml({
      ...base,
      hidePlatformBranding: false,
    })
    // The lookbehind matters: React emits numeric character references such as
    // `&#8202;` (a hair space), whose `#8202` is not a colour at all.
    const hexes = [...new Set(html.match(/(?<!&)#[0-9a-f]{3,8}/gi) ?? [])].map(
      (h) => h.toLowerCase(),
    )
    const allowed = new Set([
      "#1f2937", // ink
      "#6b7280", // muted
      "#e5e7eb", // rule
      "#eaeaea", // react-email's own <Hr> default border
      "#ffffff", // body background, CTA label
      "#fff",
      "#000000",
      "#000",
    ])
    const stray = hexes.filter((h) => !allowed.has(h))
    expect(
      stray,
      `unexpected colours in the email: ${stray.join(", ")}`,
    ).toEqual([])
    // Belt and braces: the old platform accent must be gone entirely.
    expect(html).not.toContain("#2563eb")
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
