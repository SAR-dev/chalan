import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("./local", () => ({
  saveLocalFile: vi.fn().mockResolvedValue({
    path: "/local/file.png",
    publicUrl: "/uploads/test/file.png",
  }),
  listLocalFiles: vi
    .fn()
    .mockResolvedValue([
      { key: "avatars/u1/a.png", size: 1, lastModified: new Date(0) },
    ]),
  deleteLocalFile: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("./r2", () => ({
  saveR2File: vi.fn().mockResolvedValue({
    path: "test/file.png",
    publicUrl: "https://pub.r2.dev/test/file.png",
  }),
  listR2Files: vi
    .fn()
    .mockResolvedValue([
      { key: "avatars/u1/a.png", size: 1, lastModified: new Date(0) },
    ]),
  deleteR2File: vi.fn().mockResolvedValue(undefined),
}))

import { deleteFile, listFiles, saveFile } from "./index"
import { deleteLocalFile, listLocalFiles, saveLocalFile } from "./local"
import { deleteR2File, listR2Files, saveR2File } from "./r2"

describe("saveFile", () => {
  const originalEnv = process.env.STORAGE_PROVIDER

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.STORAGE_PROVIDER
    } else {
      process.env.STORAGE_PROVIDER = originalEnv
    }
    vi.clearAllMocks()
  })

  it("defaults to local provider when STORAGE_PROVIDER is unset", async () => {
    delete process.env.STORAGE_PROVIDER
    const result = await saveFile(
      "avatars/user1/img.png",
      Buffer.from("test"),
      "image/png",
    )
    expect(saveLocalFile).toHaveBeenCalledWith(
      "avatars/user1/img.png",
      Buffer.from("test"),
    )
    expect(result.path).toBe("/local/file.png")
  })

  it("uses local provider when STORAGE_PROVIDER=local", async () => {
    process.env.STORAGE_PROVIDER = "local"
    await saveFile("test/path.png", Buffer.from("data"), "image/png")
    expect(saveLocalFile).toHaveBeenCalled()
  })

  it("uses r2 provider when STORAGE_PROVIDER=r2", async () => {
    process.env.STORAGE_PROVIDER = "r2"
    const result = await saveFile(
      "test/file.png",
      Buffer.from("data"),
      "image/png",
    )
    expect(saveR2File).toHaveBeenCalledWith(
      "test/file.png",
      Buffer.from("data"),
      "image/png",
    )
    expect(result.publicUrl).toContain("r2.dev")
  })

  it("throws on unknown STORAGE_PROVIDER", async () => {
    process.env.STORAGE_PROVIDER = "ftp"
    await expect(
      saveFile("test.png", Buffer.from(""), "image/png"),
    ).rejects.toThrow("Unknown STORAGE_PROVIDER")
  })

  it("is case insensitive for 'local'", async () => {
    process.env.STORAGE_PROVIDER = "LOCAL"
    await saveFile("test.png", Buffer.from(""), "image/png")
    expect(saveLocalFile).toHaveBeenCalled()
  })
})

describe("listFiles", () => {
  const originalEnv = process.env.STORAGE_PROVIDER

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.STORAGE_PROVIDER
    } else {
      process.env.STORAGE_PROVIDER = originalEnv
    }
    vi.clearAllMocks()
  })

  it("defaults to the local provider when STORAGE_PROVIDER is unset", async () => {
    delete process.env.STORAGE_PROVIDER
    const files = await listFiles()
    expect(listLocalFiles).toHaveBeenCalledTimes(1)
    expect(files).toEqual([
      { key: "avatars/u1/a.png", size: 1, lastModified: new Date(0) },
    ])
  })

  it("dispatches to the r2 provider", async () => {
    process.env.STORAGE_PROVIDER = "r2"
    await listFiles()
    expect(listR2Files).toHaveBeenCalledTimes(1)
    expect(listLocalFiles).not.toHaveBeenCalled()
  })

  it("throws on unknown STORAGE_PROVIDER", async () => {
    process.env.STORAGE_PROVIDER = "ftp"
    await expect(listFiles()).rejects.toThrow("Unknown STORAGE_PROVIDER")
  })
})

describe("deleteFile", () => {
  const originalEnv = process.env.STORAGE_PROVIDER

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.STORAGE_PROVIDER
    } else {
      process.env.STORAGE_PROVIDER = originalEnv
    }
    vi.clearAllMocks()
  })

  it("defaults to the local provider when STORAGE_PROVIDER is unset", async () => {
    delete process.env.STORAGE_PROVIDER
    await deleteFile("avatars/u1/a.png")
    expect(deleteLocalFile).toHaveBeenCalledWith("avatars/u1/a.png")
  })

  it("dispatches to the r2 provider", async () => {
    process.env.STORAGE_PROVIDER = "r2"
    await deleteFile("avatars/u1/a.png")
    expect(deleteR2File).toHaveBeenCalledWith("avatars/u1/a.png")
    expect(deleteLocalFile).not.toHaveBeenCalled()
  })

  it("throws on unknown STORAGE_PROVIDER", async () => {
    process.env.STORAGE_PROVIDER = "ftp"
    await expect(deleteFile("a.png")).rejects.toThrow(
      "Unknown STORAGE_PROVIDER",
    )
  })
})
