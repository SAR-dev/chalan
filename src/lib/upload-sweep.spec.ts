import { describe, expect, it, vi } from "vitest"
import { order, user } from "@/lib/db/schema"
import {
  collectReferencedKeys,
  DEFAULT_MIN_AGE_HOURS,
  findOrphans,
  IMAGE_URL_COLUMNS,
  type ImageColumnSource,
  isOrphan,
  normalizeStoredKey,
  readMinAgeHours,
  readSweepBases,
  type SweepFile,
} from "./upload-sweep"

const R2_BASE = "https://pub.r2.dev"

describe("IMAGE_URL_COLUMNS", () => {
  it("covers every schema image column", () => {
    expect(IMAGE_URL_COLUMNS).toHaveLength(9)
    expect(IMAGE_URL_COLUMNS).toContainEqual({
      table: user,
      column: user.image,
    })
    expect(IMAGE_URL_COLUMNS).toContainEqual({
      table: order,
      column: order.pickupProofRefs,
    })
    expect(IMAGE_URL_COLUMNS).toContainEqual({
      table: order,
      column: order.deliveryProofRef,
    })
  })
})

describe("readSweepBases", () => {
  it("always includes the local /uploads prefix", () => {
    expect(readSweepBases({})).toContain("/uploads")
  })

  it("adds the configured public URL prefixes", () => {
    const bases = readSweepBases({
      R2_PUBLIC_URL: R2_BASE,
    })
    expect(bases).toEqual(["/uploads", R2_BASE])
  })

  it("ignores empty prefixes", () => {
    expect(readSweepBases({ R2_PUBLIC_URL: "   " })).toEqual(["/uploads"])
  })
})

describe("readMinAgeHours", () => {
  it("defaults to 48 hours when unset", () => {
    expect(readMinAgeHours({})).toBe(DEFAULT_MIN_AGE_HOURS)
    expect(readMinAgeHours({})).toBe(48)
  })

  it("reads a configured value", () => {
    expect(readMinAgeHours({ UPLOAD_SWEEP_MIN_AGE_HOURS: "72" })).toBe(72)
    expect(readMinAgeHours({ UPLOAD_SWEEP_MIN_AGE_HOURS: "0.5" })).toBe(0.5)
  })

  it("falls back to the default for invalid values", () => {
    expect(readMinAgeHours({ UPLOAD_SWEEP_MIN_AGE_HOURS: "0" })).toBe(
      DEFAULT_MIN_AGE_HOURS,
    )
    expect(readMinAgeHours({ UPLOAD_SWEEP_MIN_AGE_HOURS: "-3" })).toBe(
      DEFAULT_MIN_AGE_HOURS,
    )
    expect(readMinAgeHours({ UPLOAD_SWEEP_MIN_AGE_HOURS: "soon" })).toBe(
      DEFAULT_MIN_AGE_HOURS,
    )
    expect(readMinAgeHours({ UPLOAD_SWEEP_MIN_AGE_HOURS: "" })).toBe(
      DEFAULT_MIN_AGE_HOURS,
    )
  })
})

describe("normalizeStoredKey", () => {
  const bases = ["/uploads", R2_BASE]

  it("strips the local /uploads prefix", () => {
    expect(normalizeStoredKey("/uploads/avatars/x.png", bases)).toBe(
      "avatars/x.png",
    )
  })

  it("strips a full R2 public URL", () => {
    expect(normalizeStoredKey(`${R2_BASE}/nids/u1/x.png`, bases)).toBe(
      "nids/u1/x.png",
    )
  })

  it("strips a base with a trailing slash", () => {
    expect(normalizeStoredKey(`${R2_BASE}/x.png`, [`${R2_BASE}/`])).toBe(
      "x.png",
    )
  })

  it("strips trailing query strings", () => {
    expect(
      normalizeStoredKey(`${R2_BASE}/avatars/x.png?width=100`, bases),
    ).toBe("avatars/x.png")
    expect(normalizeStoredKey("/uploads/avatars/x.png#frag", bases)).toBe(
      "avatars/x.png",
    )
  })

  it("decodes percent-encoding", () => {
    expect(normalizeStoredKey(`${R2_BASE}/avatars/a%20b.png`, bases)).toBe(
      "avatars/a b.png",
    )
    expect(normalizeStoredKey("/uploads/avatars/a%20b.png", bases)).toBe(
      "avatars/a b.png",
    )
  })

  it("keeps a bare provider-relative key as-is", () => {
    expect(normalizeStoredKey("pickups/m1/x.png", bases)).toBe(
      "pickups/m1/x.png",
    )
  })

  it("normalizes windows separators", () => {
    expect(normalizeStoredKey("\\avatars\\x.png", bases)).toBe("avatars/x.png")
  })

  it("returns null for empty and non-string values", () => {
    expect(normalizeStoredKey(null, bases)).toBeNull()
    expect(normalizeStoredKey(undefined, bases)).toBeNull()
    expect(normalizeStoredKey("", bases)).toBeNull()
    expect(normalizeStoredKey("   ", bases)).toBeNull()
    expect(normalizeStoredKey(42, bases)).toBeNull()
  })

  it("returns null when the value is only the base", () => {
    expect(normalizeStoredKey("/uploads", bases)).toBeNull()
    expect(normalizeStoredKey(R2_BASE, bases)).toBeNull()
  })

  it("does not match a lookalike host as a base prefix", () => {
    expect(normalizeStoredKey("https://pub.r2.dev.evil.com/a.png", bases)).toBe(
      "a.png",
    )
  })

  it("falls back to the path for unknown absolute URLs", () => {
    expect(normalizeStoredKey("https://i.pravatar.cc/150?img=1", bases)).toBe(
      "150",
    )
    expect(
      normalizeStoredKey("http://localhost:3000/uploads/avatars/x.png", bases),
    ).toBe("avatars/x.png")
  })

  it("leaves non-URL references (data URIs, bare filenames) intact", () => {
    const placeholder = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0="
    expect(normalizeStoredKey(placeholder, bases)).toBe(placeholder)
    expect(normalizeStoredKey("proof_ord_1.jpg", bases)).toBe("proof_ord_1.jpg")
  })
})

describe("collectReferencedKeys", () => {
  const bases = ["/uploads"]

  it("queries every registered image column", async () => {
    const read = vi.fn(async (_source: ImageColumnSource) => [])
    await collectReferencedKeys(read, bases)
    expect(read).toHaveBeenCalledTimes(IMAGE_URL_COLUMNS.length)
    const sources = read.mock.calls.map((call) => call[0])
    expect(sources).toEqual([...IMAGE_URL_COLUMNS])
  })

  it("normalizes values and skips empty ones", async () => {
    const read = vi.fn(async () => [
      "/uploads/avatars/u1/x.png",
      `${R2_BASE}/nids/m1/y.png`,
      null,
      undefined,
      "",
      "   ",
    ])
    const keys = await collectReferencedKeys(read, bases)
    expect(keys).toEqual(new Set(["avatars/u1/x.png", "nids/m1/y.png"]))
  })

  it("flattens array columns such as order.pickupProofRefs", async () => {
    const read = vi.fn(async (source: ImageColumnSource) =>
      source.column === order.pickupProofRefs
        ? [["/uploads/pickups/a.png", null, "/uploads/pickups/b.png"]]
        : [null],
    )
    const keys = await collectReferencedKeys(read, bases)
    expect(keys).toEqual(new Set(["pickups/a.png", "pickups/b.png"]))
  })

  it("runs the reader sequentially over the sources", async () => {
    const seen: unknown[] = []
    const read = vi.fn(async (source: ImageColumnSource) => {
      seen.push(source.column)
      return [null]
    })
    await collectReferencedKeys(read, bases)
    expect(seen).toEqual(IMAGE_URL_COLUMNS.map((source) => source.column))
  })
})

describe("isOrphan", () => {
  const bases = ["/uploads"]
  const now = new Date("2026-01-10T00:00:00.000Z")
  const old = new Date(now.getTime() - 49 * 3_600_000)
  const fresh = new Date(now.getTime() - 1 * 3_600_000)

  const check = (
    overrides: Partial<Parameters<typeof isOrphan>[0]> = {},
  ): ReturnType<typeof isOrphan> =>
    isOrphan({
      key: "nids/m1/x.png",
      lastModified: old,
      referencedKeys: new Set<string>(),
      minAgeHours: 48,
      now,
      bases,
      ...overrides,
    })

  it("keeps referenced files", () => {
    expect(
      check({
        key: "/uploads/avatars/u1/x.png",
        referencedKeys: new Set(["avatars/u1/x.png"]),
      }),
    ).toBe(false)
  })

  it("keeps fresh unreferenced files (grace period)", () => {
    expect(check({ lastModified: fresh })).toBe(false)
  })

  it("flags old unreferenced files", () => {
    expect(check()).toBe(true)
  })

  it("flags files exactly at the grace-period boundary", () => {
    expect(
      check({ lastModified: new Date(now.getTime() - 48 * 3_600_000) }),
    ).toBe(true)
    expect(
      check({
        lastModified: new Date(now.getTime() - 48 * 3_600_000 + 1),
        minAgeHours: 48,
      }),
    ).toBe(false)
  })

  it("respects a configured min age", () => {
    expect(
      check({
        lastModified: new Date(now.getTime() - 30 * 60_000),
        minAgeHours: 1,
      }),
    ).toBe(false)
    expect(
      check({
        lastModified: new Date(now.getTime() - 2 * 3_600_000),
        minAgeHours: 1,
      }),
    ).toBe(true)
  })

  it("keeps files whose timestamp is in the future (clock skew)", () => {
    expect(
      check({ lastModified: new Date(now.getTime() + 6 * 3_600_000) }),
    ).toBe(false)
  })
})

describe("findOrphans", () => {
  const bases = ["/uploads"]
  const now = new Date("2026-01-10T00:00:00.000Z")
  const old = new Date(now.getTime() - 49 * 3_600_000)
  const fresh = new Date(now.getTime() - 1 * 3_600_000)

  const files: SweepFile[] = [
    { key: "avatars/u1/used.png", size: 10, lastModified: old },
    { key: "avatars/u1/orphan.png", size: 20, lastModified: old },
    { key: "avatars/u1/just-uploaded.png", size: 30, lastModified: fresh },
  ]

  it("returns only old, unreferenced files", () => {
    const orphans = findOrphans({
      files,
      referencedKeys: new Set(["avatars/u1/used.png"]),
      minAgeHours: 48,
      now,
      bases,
    })
    expect(orphans.map((file) => file.key)).toEqual(["avatars/u1/orphan.png"])
  })

  it("returns nothing when everything is referenced", () => {
    const orphans = findOrphans({
      files,
      referencedKeys: new Set([
        "avatars/u1/used.png",
        "avatars/u1/orphan.png",
        "avatars/u1/just-uploaded.png",
      ]),
      minAgeHours: 48,
      now,
      bases,
    })
    expect(orphans).toEqual([])
  })

  it("compares listing keys against URL-form references", () => {
    const orphans = findOrphans({
      files: [{ key: "nids/m1/x.png", size: 5, lastModified: old }],
      referencedKeys: new Set(["nids/m1/x.png"]),
      minAgeHours: 48,
      now,
      bases,
    })
    expect(orphans).toEqual([])
  })
})
