import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("./local", () => ({
  saveLocalFile: vi.fn().mockResolvedValue({
    path: "/local/file.png",
    publicUrl: "/uploads/test/file.png",
  }),
}))

vi.mock("./r2", () => ({
  saveR2File: vi.fn().mockResolvedValue({
    path: "test/file.png",
    publicUrl: "https://pub.r2.dev/test/file.png",
  }),
}))

vi.mock("./supabase", () => ({
  saveSupabaseFile: vi.fn().mockResolvedValue({
    path: "test/file.png",
    publicUrl: "https://supabase.co/storage/test/file.png",
  }),
}))

import { saveFile } from "./index"
import { saveLocalFile } from "./local"
import { saveR2File } from "./r2"
import { saveSupabaseFile } from "./supabase"

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

  it("uses supabase provider when STORAGE_PROVIDER=supabase", async () => {
    process.env.STORAGE_PROVIDER = "supabase"
    const result = await saveFile(
      "test/file.png",
      Buffer.from("data"),
      "image/png",
    )
    expect(saveSupabaseFile).toHaveBeenCalledWith(
      "test/file.png",
      Buffer.from("data"),
      "image/png",
    )
    expect(result.publicUrl).toContain("supabase.co")
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
