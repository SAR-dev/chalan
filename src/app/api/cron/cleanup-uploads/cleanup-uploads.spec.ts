import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { IMAGE_URL_COLUMNS } from "@/lib/upload-sweep"

const { mockListFiles, mockDeleteFile, mockSelect } = vi.hoisted(() => ({
  mockListFiles: vi.fn(),
  mockDeleteFile: vi.fn(),
  mockSelect: vi.fn(),
}))

vi.mock("@/lib/storage", () => ({
  listFiles: mockListFiles,
  deleteFile: mockDeleteFile,
}))

vi.mock("@/lib/db", () => ({
  dbRead: { select: mockSelect },
  db: {},
  pool: {},
}))

import { user } from "@/lib/db/schema"
import { POST as cleanupUploads } from "./route"

const CRON_SECRET = "test-secret-123"
const SWEEP_SIZE = IMAGE_URL_COLUMNS.length

let columnValues: Map<unknown, unknown[]>
let lateValues: Map<unknown, unknown[]>
let fromCalls: number

function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 3_600_000)
}

function authReq(url = "http://test.local/api/cron/cleanup-uploads"): Request {
  return new Request(url, {
    method: "POST",
    headers: { authorization: `Bearer ${CRON_SECRET}` },
  })
}

beforeEach(() => {
  process.env.CRON_SECRET = CRON_SECRET
  columnValues = new Map()
  lateValues = new Map()
  fromCalls = 0
  mockListFiles.mockReset()
  mockDeleteFile.mockReset()
  mockDeleteFile.mockResolvedValue(undefined)
  // The route reads the referenced set twice: once to find candidates, once
  // right before deleting (ROADMAP 5.6 no-stale-snapshot rail).
  mockSelect.mockReset()
  mockSelect.mockImplementation((fields: { value: unknown }) => ({
    from: async () => {
      fromCalls += 1
      // lateValues overrides columnValues from the second sweep on, so a
      // test can simulate a reference appearing between the two reads.
      const late =
        fromCalls > SWEEP_SIZE ? lateValues.get(fields.value) : undefined
      const values = late ?? columnValues.get(fields.value) ?? []
      return values.map((value) => ({ value }))
    },
  }))
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("POST /api/cron/cleanup-uploads", () => {
  it("401 when Authorization header is missing", async () => {
    const res = await cleanupUploads(
      new Request("http://test.local/api/cron/cleanup-uploads", {
        method: "POST",
      }),
    )
    expect(res.status).toBe(401)
  })

  it("401 when the bearer token is wrong", async () => {
    const res = await cleanupUploads(
      new Request("http://test.local/api/cron/cleanup-uploads", {
        method: "POST",
        headers: { authorization: "Bearer nope" },
      }),
    )
    expect(res.status).toBe(401)
    expect(mockDeleteFile).not.toHaveBeenCalled()
  })

  it("dry run reports orphans but deletes nothing", async () => {
    columnValues.set(user.image, ["/uploads/avatars/u1/used.png"])
    mockListFiles.mockResolvedValue([
      { key: "avatars/u1/used.png", size: 10, lastModified: hoursAgo(100) },
      { key: "logos/m1/orphan.png", size: 20, lastModified: hoursAgo(100) },
    ])

    const res = await cleanupUploads(
      authReq("http://test.local/api/cron/cleanup-uploads?dryRun=1"),
    )
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toMatchObject({
      scanned: 2,
      orphans: 1,
      deleted: 0,
      failed: 0,
      bytesFreed: 0,
      dryRun: true,
    })
    expect(mockDeleteFile).not.toHaveBeenCalled()
    // One sweep only — no second read when nothing is deleted.
    expect(mockSelect).toHaveBeenCalledTimes(SWEEP_SIZE)
  })

  it("deletes only the old unreferenced file", async () => {
    columnValues.set(user.image, ["/uploads/avatars/u1/used.png"])
    mockListFiles.mockResolvedValue([
      { key: "avatars/u1/used.png", size: 10, lastModified: hoursAgo(100) },
      { key: "logos/m1/orphan.png", size: 20, lastModified: hoursAgo(100) },
      { key: "logos/m1/fresh.png", size: 30, lastModified: hoursAgo(1) },
    ])

    const res = await cleanupUploads(authReq())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toMatchObject({
      scanned: 3,
      orphans: 1,
      deleted: 1,
      failed: 0,
      bytesFreed: 20,
      dryRun: false,
    })
    expect(mockDeleteFile).toHaveBeenCalledTimes(1)
    expect(mockDeleteFile).toHaveBeenCalledWith("logos/m1/orphan.png")
    // Referenced set re-read right before the delete loop.
    expect(mockSelect).toHaveBeenCalledTimes(SWEEP_SIZE * 2)
  })

  it("re-checks the referenced set before deleting (no stale snapshot)", async () => {
    mockListFiles.mockResolvedValue([
      { key: "logos/m1/orphan.png", size: 20, lastModified: hoursAgo(100) },
    ])
    // Nothing referenced during the first sweep, but the file gets attached
    // before the second sweep runs.
    lateValues.set(user.image, ["/uploads/logos/m1/orphan.png"])

    const res = await cleanupUploads(authReq())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toMatchObject({ orphans: 1, deleted: 0, failed: 0 })
    expect(mockDeleteFile).not.toHaveBeenCalled()
  })

  it("respects UPLOAD_SWEEP_MIN_AGE_HOURS", async () => {
    vi.stubEnv("UPLOAD_SWEEP_MIN_AGE_HOURS", "200")
    mockListFiles.mockResolvedValue([
      { key: "logos/m1/orphan.png", size: 20, lastModified: hoursAgo(100) },
    ])

    const res = await cleanupUploads(authReq())
    const json = await res.json()

    expect(json).toMatchObject({ scanned: 1, orphans: 0, deleted: 0 })
    expect(mockDeleteFile).not.toHaveBeenCalled()
  })

  it("continues past a per-file delete failure", async () => {
    mockDeleteFile.mockRejectedValueOnce(new Error("disk on fire"))
    mockListFiles.mockResolvedValue([
      { key: "logos/m1/a.png", size: 10, lastModified: hoursAgo(100) },
      { key: "logos/m1/b.png", size: 20, lastModified: hoursAgo(100) },
    ])

    const res = await cleanupUploads(authReq())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toMatchObject({
      scanned: 2,
      orphans: 2,
      deleted: 1,
      failed: 1,
      bytesFreed: 20,
    })
    expect(mockDeleteFile).toHaveBeenCalledTimes(2)
  })

  it("handles an empty storage listing", async () => {
    mockListFiles.mockResolvedValue([])

    const res = await cleanupUploads(authReq())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toMatchObject({
      scanned: 0,
      orphans: 0,
      deleted: 0,
      failed: 0,
      bytesFreed: 0,
    })
  })
})
