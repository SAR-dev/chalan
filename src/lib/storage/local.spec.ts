import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

const mockMkdir = vi.fn().mockResolvedValue(undefined)
const mockWriteFile = vi.fn().mockResolvedValue(undefined)

// mkdir/writeFile stay mocked (saveLocalFile assertions below); everything
// else — readdir/stat/unlink — is real so listLocalFiles/deleteLocalFile can
// run against a temp directory.
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>()
  return {
    ...actual,
    mkdir: (...args: unknown[]) => mockMkdir(...args),
    writeFile: (...args: unknown[]) => mockWriteFile(...args),
  }
})

const tmpRoot = mkdtempSync(join(tmpdir(), "chalan-uploads-"))
vi.stubEnv("LOCAL_UPLOADS_DIR", tmpRoot)

let saveLocalFile: typeof import("./local").saveLocalFile
let listLocalFiles: typeof import("./local").listLocalFiles
let deleteLocalFile: typeof import("./local").deleteLocalFile
let UPLOADS_URL_PREFIX: string

beforeAll(async () => {
  const mod = await import("./local")
  saveLocalFile = mod.saveLocalFile
  listLocalFiles = mod.listLocalFiles
  deleteLocalFile = mod.deleteLocalFile
  UPLOADS_URL_PREFIX = mod.UPLOADS_URL_PREFIX
})

function resetDir(): void {
  rmSync(tmpRoot, { recursive: true, force: true })
  mkdirSync(tmpRoot, { recursive: true })
}

afterAll(() => {
  rmSync(tmpRoot, { recursive: true, force: true })
  vi.unstubAllEnvs()
})

describe("UPLOADS_URL_PREFIX", () => {
  it("is /uploads", () => {
    expect(UPLOADS_URL_PREFIX).toBe("/uploads")
  })
})

describe("saveLocalFile", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockMkdir.mockResolvedValue(undefined)
    mockWriteFile.mockResolvedValue(undefined)
  })

  it("writes file and returns path + publicUrl", async () => {
    const result = await saveLocalFile(
      "avatars/user1/img.png",
      Buffer.from("data"),
    )
    expect(result.path.replace(/\\/g, "/")).toContain("avatars/user1/img.png")
    expect(result.publicUrl).toBe("/uploads/avatars/user1/img.png")
  })

  it("creates directories recursively", async () => {
    await saveLocalFile("avatars/user1/img.png", Buffer.from("data"))
    expect(mockMkdir).toHaveBeenCalled()
  })

  it("writes buffer to the target path", async () => {
    const buffer = Buffer.from("hello")
    await saveLocalFile("test/file.txt", buffer)
    const writtenPath = mockWriteFile.mock.calls[0][0] as string
    expect(writtenPath.replace(/\\/g, "/")).toContain("test/file.txt")
    expect(mockWriteFile.mock.calls[0][1]).toBe(buffer)
  })

  it("rejects path traversal attempts", async () => {
    await expect(
      saveLocalFile("../../etc/passwd", Buffer.from("data")),
    ).rejects.toThrow("Refusing to write outside the uploads directory")
  })

  it("rejects path traversal with encoded dots", async () => {
    await expect(
      saveLocalFile("valid/../../../etc/shadow", Buffer.from("data")),
    ).rejects.toThrow("Refusing to write outside the uploads directory")
  })
})

describe("listLocalFiles", () => {
  beforeEach(() => {
    resetDir()
  })

  afterEach(() => {
    resetDir()
  })

  it("lists files recursively as provider-relative posix keys", async () => {
    mkdirSync(join(tmpRoot, "avatars", "u1"), { recursive: true })
    writeFileSync(join(tmpRoot, "avatars", "u1", "a.png"), "aa")
    writeFileSync(join(tmpRoot, "top.png"), "b")

    const files = await listLocalFiles()

    expect(files.map((file) => file.key)).toEqual([
      "avatars/u1/a.png",
      "top.png",
    ])
    expect(files[0].size).toBe(2)
    expect(files[0].lastModified).toBeInstanceOf(Date)
    expect(files[1].size).toBe(1)
  })

  it("skips directories", async () => {
    mkdirSync(join(tmpRoot, "nids", "m1"), { recursive: true })
    writeFileSync(join(tmpRoot, "nids", "m1", "x.png"), "x")

    const files = await listLocalFiles()

    expect(files.map((file) => file.key)).toEqual(["nids/m1/x.png"])
  })

  it("returns an empty list when the uploads dir is missing", async () => {
    rmSync(tmpRoot, { recursive: true, force: true })

    await expect(listLocalFiles()).resolves.toEqual([])
  })
})

describe("deleteLocalFile", () => {
  beforeEach(() => {
    resetDir()
  })

  afterEach(() => {
    resetDir()
  })

  it("deletes the file behind a provider-relative key", async () => {
    mkdirSync(join(tmpRoot, "delivery-proofs", "u1"), { recursive: true })
    const target = join(tmpRoot, "delivery-proofs", "u1", "a.png")
    writeFileSync(target, "x")

    await deleteLocalFile("delivery-proofs/u1/a.png")

    expect(() => rmSync(target)).toThrow()
  })

  it("propagates a missing-file error", async () => {
    await expect(deleteLocalFile("avatars/u1/missing.png")).rejects.toThrow()
  })

  it.each([
    "../outside.png",
    "avatars/../../outside.png",
    "/etc/passwd",
    "",
    ".",
    "avatars/./a.png",
  ])("refuses traversal key %j", async (key) => {
    await expect(deleteLocalFile(key)).rejects.toThrow(
      "Refusing to delete outside the uploads directory",
    )
  })
})
