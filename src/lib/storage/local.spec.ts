import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const mockMkdir = vi.fn().mockResolvedValue(undefined)
const mockWriteFile = vi.fn().mockResolvedValue(undefined)

vi.mock("node:fs/promises", () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}))

vi.stubEnv("LOCAL_UPLOADS_DIR", "/tmp/uploads")

let saveLocalFile: typeof import("./local").saveLocalFile
let UPLOADS_URL_PREFIX: string

beforeAll(async () => {
  const mod = await import("./local")
  saveLocalFile = mod.saveLocalFile
  UPLOADS_URL_PREFIX = mod.UPLOADS_URL_PREFIX
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
