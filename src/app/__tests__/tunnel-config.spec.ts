import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

// Three mechanisms, two hostnames and a committed tunnel UUID — the "which one
// Is actually live?" problem:
//
//   config.yml         → committed tunnel UUID + `hostname: sarn.top`
//   deploy.yml         → defaulted NEXT_PUBLIC_SITE_URL to `chalan.sarn.top`
//   compose.cluster.yml→ ran cloudflared from `CLOUDFLARE_TUNNEL_TOKEN`
//
// Resolution: `config.yml` is now gitignored (it carries whoever's tunnel), a
// committed `config.example.yml` holds a placeholder, and the token flow — the
// one all three docs already describe — is the deployment path.

const UUID = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i

function read(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), "utf-8")
}

describe("tunnel identity", () => {
  it("ships a template rather than a live tunnel", () => {
    expect(existsSync(join(process.cwd(), "config.example.yml"))).toBe(true)
    const example = read("config.example.yml")
    expect(example).toContain("REPLACE_WITH_YOUR_TUNNEL_UUID")
    expect(example, "a real tunnel id leaked into the template").not.toMatch(
      UUID,
    )
  })

  it("keeps the real config.yml out of git", () => {
    // Presence in .gitignore is what stops it being recommitted; the file
    // itself stays on disk so local tunnel setups keep working.
    expect(read(".gitignore")).toMatch(/^\s*config\.yml\s*$/m)
  })

  it("keeps the old ingress hostname out of deployment config", () => {
    // `chalan.sarn.top` is the documented deploy default. A *bare* `sarn.top`
    // is the ingress host that used to sit in the committed config.yml — two
    // names for one deployment.
    for (const file of [
      "docker/compose.cluster.yml",
      "docker/compose.monolith.yml",
      ".github/workflows/deploy.yml",
      ".github/workflows/ci.yml",
    ]) {
      const raw = read(...file.split("/"))
      expect(raw, file).not.toMatch(/(?<![\w.-])sarn\.top/)
    }
  })

  it("commits no tunnel UUID to deployment config", () => {
    for (const file of [
      "docker/compose.cluster.yml",
      "docker/compose.monolith.yml",
      ".github/workflows/deploy.yml",
      ".github/workflows/ci.yml",
      "vercel.json",
    ]) {
      const raw = read(...file.split("/"))
      expect(raw, `${file} contains a tunnel UUID`).not.toMatch(UUID)
    }
  })
})
