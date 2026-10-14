import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Static response headers live in `next.config.mjs`; the per-request CSP lives
// In `src/proxy.ts`. Nothing asserted these two before, so
// dropping either would have been invisible.

const config = readFileSync(join(process.cwd(), "next.config.mjs"), "utf-8")
const proxy = readFileSync(join(process.cwd(), "src", "proxy.ts"), "utf-8")

describe("static security headers", () => {
  it("stops announcing the framework", () => {
    // `X-Powered-By: Next.js` tells an attacker the framework and version
    // before they have probed for anything.
    expect(config).toMatch(/\bpoweredByHeader:\s*false\b/)
  })

  it("sets HSTS, which nothing else in the stack did", () => {
    const match = config.match(
      /Strict-Transport-Security["',\s]*value:\s*"([^"]+)"/,
    )
    expect(match, "Strict-Transport-Security header is missing").not.toBeNull()

    const maxAge = match![1].match(/max-age=(\d+)/)
    expect(maxAge, "HSTS needs an explicit max-age").not.toBeNull()
    // Browsers ignore HSTS over plain HTTP, so local dev is unaffected; a
    // year is the shortest max-age worth shipping.
    expect(Number(maxAge![1])).toBeGreaterThanOrEqual(31_536_000)
    expect(match![1]).toContain("includeSubDomains")
  })

  it("keeps the nonce'd CSP out of the static config", () => {
    // A static header cannot carry a per-request nonce, so declaring one here
    // would ship a policy that blocks Next's own hydration scripts. The note
    // in `next.config.mjs` records it; this asserts it stays true.
    expect(config).not.toMatch(/["']Content-Security-Policy["']/)
    expect(proxy).toContain("content-security-policy")
  })
})

describe("CSP directives the app depends on", () => {
  const directive = (name: string): string | undefined =>
    proxy.match(new RegExp(`"${name}[^"]*"`))?.[0]

  it("allows blob: images, or the label designer preview is blocked", () => {
    // `LabelPreview` renders the rasterised label in an `<img src="blob:…">`.
    // Without `blob:` in `img-src` the browser refuses the image — which
    // presents as an empty preview with a console error naming blob:, and
    // nothing else.
    const imgSrc = directive("img-src")
    expect(imgSrc, "no img-src directive in the CSP").toBeDefined()
    expect(imgSrc).toContain("blob:")
    expect(imgSrc).toContain("'self'")
  })

  it("allows blob: frames, for the print path", () => {
    // The print action frames the generated PDF in an `<iframe src="blob:…">`
    // because `object-src` stays `'none'`. The designer preview no longer needs
    // this — it renders an image — but the print frame does.
    const frameSrc = directive("frame-src")
    expect(frameSrc, "no frame-src directive in the CSP").toBeDefined()
    expect(frameSrc).toContain("blob:")
    // Scoped to framing, not a blanket loosening.
    expect(frameSrc).toContain("'self'")
  })

  it("keeps object-src at 'none', so the print frame must use <iframe>", () => {
    // The print path frames the PDF rather than embedding it precisely so this
    // stays true. If someone switches it back to <embed> to "simplify", the PDF
    // is blocked by the browser and the print dialog silently prints a blank
    // page while Download — a plain `<a download>` — keeps working.
    expect(directive("object-src")).toBe("\"object-src 'none'\"")
  })

  it("does not add blob: to script-src", () => {
    // blob: is justified for frames and workers because both are documents or
    // executables we construct from already-trusted data. In script-src it would
    // let any inline string become an executable script.
    const scriptSrc = proxy.match(/"script-src[^"]*"/)?.[0] ?? ""
    expect(scriptSrc).not.toContain("blob:")
  })
})
