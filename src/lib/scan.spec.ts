import { readdirSync, readFileSync } from "node:fs"
import { join, relative, sep } from "node:path"
import QrScanner from "qr-scanner"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { scanImage } from "./scan"

// The wrapper is the only call site of the decoder, so the decoder is mocked
// at its boundary: these tests pin `scanImage`'s contract (two shapes, never
// throws), not nimiq's decode quality.
vi.mock("qr-scanner", () => ({
  default: { scanImage: vi.fn() },
}))

const scanImageMock = vi.mocked(QrScanner.scanImage)

beforeEach(() => {
  scanImageMock.mockReset()
})

function capture(): File {
  return new File(["not-really-a-qr"], "label.png", { type: "image/png" })
}

describe("scanImage", () => {
  it("returns the decoded text as a code outcome", async () => {
    scanImageMock.mockResolvedValue({ data: "ORD-100042" } as never)

    await expect(scanImage(capture())).resolves.toEqual({
      kind: "code",
      text: "ORD-100042",
    })
    expect(scanImageMock).toHaveBeenCalledWith(
      expect.any(File),
      // Detailed results, not the bare string — the gate needs `.data`.
      { returnDetailedScanResult: true },
    )
  })

  it("maps a decode failure to no-code rather than throwing", async () => {
    scanImageMock.mockRejectedValue(new Error("no QR code found"))

    await expect(scanImage(capture())).resolves.toEqual({ kind: "no-code" })
  })

  it("maps a synchronously-throwing decoder to no-code rather than throwing", async () => {
    // A decoder with the wrong shape (bad chunk, unexpected upgrade) throws at
    // call time instead of rejecting — same catch, same retry hint.
    scanImageMock.mockImplementation(() => {
      throw new Error("scanImage is not a function")
    })

    await expect(scanImage(capture())).resolves.toEqual({ kind: "no-code" })
  })
})

// ---------------------------------------------------------------------------
// One-module rule: `src/lib/scan.ts` is the ONLY file allowed to import
// qr-scanner. Swapping decoders later (zxing-wasm escape hatch) must stay a
// one-file change, and a call site reaching around the wrapper would bypass
// the never-throws contract. In the spirit of route-auth-guard.spec.ts.
// ---------------------------------------------------------------------------

const SRC_DIR = join(process.cwd(), "src")
// Posix literals — compared against toPosix(rel(...)) output, so no `join`
// (which would produce backslashes on Windows and silently allow nothing).
const ALLOWED = new Set(["src/lib/scan.ts"])

function toPosix(path: string): string {
  return path.split(sep).join("/")
}

/** Import statements only — `vi.mock("qr-scanner")` in specs is not an import. */
const QR_SCANNER_IMPORT =
  /(?:from\s+|import\s*\(\s*|import\s+)["']qr-scanner(?:\/[^"']*)?["']/

function collectSourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collectSourceFiles(full))
    // Specs import the mocked module to type it — they never *use* it, and a
    // real call site hiding in a spec would still be caught by the wrapper's
    // own contract tests.
    else if (
      /\.(ts|tsx)$/.test(entry.name) &&
      !/\.spec\.(ts|tsx)$/.test(entry.name)
    )
      out.push(full)
  }
  return out
}

describe("qr-scanner import guard", () => {
  it("allows qr-scanner imports only from src/lib/scan.ts", () => {
    const offenders: string[] = []
    for (const file of collectSourceFiles(SRC_DIR)) {
      const rel = toPosix(relative(process.cwd(), file))
      if (ALLOWED.has(rel)) continue
      if (QR_SCANNER_IMPORT.test(readFileSync(file, "utf8")))
        offenders.push(rel)
    }
    if (offenders.length > 0) {
      throw new Error(
        "Files importing qr-scanner outside the wrapper — move the decode " +
          "call behind src/lib/scan.ts:\n" +
          offenders.map((file) => `  - ${file}`).join("\n"),
      )
    }
    expect(offenders).toEqual([])
  })

  it("the wrapper itself does import it (guard is not vacuous)", () => {
    const source = readFileSync(join(SRC_DIR, "lib", "scan.ts"), "utf8")
    expect(source).toMatch(QR_SCANNER_IMPORT)
  })
})

// ---------------------------------------------------------------------------
// The two R9 files that ship the scanner surface must stay photo-only: the OS
// capture intent on the file input is the sole camera API, and nothing in the
// scanner feature may branch on the user agent (qr-scanner's internal
// Ventura workaround is upstream's, not ours). Comments are stripped first
// because both files document what they deliberately do NOT use.
// ---------------------------------------------------------------------------
describe("scanner camera/UA surface (static)", () => {
  const R9_SURFACES = [
    join("src", "lib", "scan.ts"),
    join("src", "features", "orders", "components", "scan-gate.tsx"),
  ]

  function stripped(file: string): string {
    return readFileSync(join(process.cwd(), file), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
  }

  it("uses no <video>, no getUserMedia and no user-agent read", () => {
    const forbidden = /userAgent|getUserMedia|mediaDevices|<video/
    const offenders = R9_SURFACES.filter((file) =>
      forbidden.test(stripped(file)),
    )
    expect(offenders).toEqual([])
  })
})
