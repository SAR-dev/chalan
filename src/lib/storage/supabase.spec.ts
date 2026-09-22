import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { mockUpload } = vi.hoisted(() => ({
  mockUpload: vi.fn().mockResolvedValue({ error: null }),
}))

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn().mockReturnValue({
    storage: {
      from: vi.fn().mockReturnValue({ upload: mockUpload }),
    },
  }),
}))

import { saveSupabaseFile } from "./supabase"

describe("saveSupabaseFile", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.SUPABASE_URL = "https://test.supabase.co"
    process.env.SUPABASE_SERVICE_KEY = "test-key"
    process.env.SUPABASE_BUCKET = "uploads"
    process.env.SUPABASE_PUBLIC_URL =
      "https://test.supabase.co/storage/v1/object/public/uploads"
    vi.clearAllMocks()
    mockUpload.mockResolvedValue({ error: null })
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("uploads file and returns path + publicUrl", async () => {
    const result = await saveSupabaseFile(
      "avatars/user1/img.png",
      Buffer.from("data"),
      "image/png",
    )
    expect(result.path).toBe("avatars/user1/img.png")
    expect(result.publicUrl).toBe(
      "https://test.supabase.co/storage/v1/object/public/uploads/avatars/user1/img.png",
    )
  })

  it("strips trailing slash from public URL", async () => {
    process.env.SUPABASE_PUBLIC_URL =
      "https://test.supabase.co/storage/v1/object/public/uploads/"
    const result = await saveSupabaseFile(
      "test.png",
      Buffer.from("data"),
      "image/png",
    )
    expect(result.publicUrl).toBe(
      "https://test.supabase.co/storage/v1/object/public/uploads/test.png",
    )
  })

  it("calls upload with correct parameters", async () => {
    const buffer = Buffer.from("test-data")
    await saveSupabaseFile("test/file.png", buffer, "image/png")
    expect(mockUpload).toHaveBeenCalledWith("test/file.png", buffer, {
      contentType: "image/png",
      upsert: false,
      cacheControl: "31536000",
    })
  })

  it("throws when upload fails", async () => {
    mockUpload.mockResolvedValueOnce({ error: { message: "upload failed" } })
    await expect(
      saveSupabaseFile("test.png", Buffer.from(""), "image/png"),
    ).rejects.toThrow("Supabase upload failed: upload failed")
  })

  it("throws when SUPABASE_URL is missing", async () => {
    delete process.env.SUPABASE_URL
    await expect(
      saveSupabaseFile("test.png", Buffer.from(""), "image/png"),
    ).rejects.toThrow("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
  })

  it("throws when SUPABASE_SERVICE_KEY is missing", async () => {
    delete process.env.SUPABASE_SERVICE_KEY
    await expect(
      saveSupabaseFile("test.png", Buffer.from(""), "image/png"),
    ).rejects.toThrow("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
  })

  it("throws when SUPABASE_BUCKET is missing", async () => {
    delete process.env.SUPABASE_BUCKET
    await expect(
      saveSupabaseFile("test.png", Buffer.from(""), "image/png"),
    ).rejects.toThrow("Missing env var: SUPABASE_BUCKET")
  })

  it("throws when SUPABASE_PUBLIC_URL is missing", async () => {
    delete process.env.SUPABASE_PUBLIC_URL
    await expect(
      saveSupabaseFile("test.png", Buffer.from(""), "image/png"),
    ).rejects.toThrow("Missing env var: SUPABASE_PUBLIC_URL")
  })
})
