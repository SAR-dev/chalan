import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mockSend = vi.fn().mockResolvedValue({})

vi.mock("@aws-sdk/client-s3", () => {
  class MockS3Client {
    send = mockSend
  }
  class MockPutObjectCommand {
    input: unknown
    constructor(input: unknown) {
      this.input = input
    }
  }
  return {
    S3Client: MockS3Client,
    PutObjectCommand: MockPutObjectCommand,
  }
})

import { saveR2File } from "./r2"

describe("saveR2File", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.R2_ACCOUNT_ID = "test-account"
    process.env.R2_ACCESS_KEY_ID = "test-key"
    process.env.R2_SECRET_ACCESS_KEY = "test-secret"
    process.env.R2_BUCKET_NAME = "test-bucket"
    process.env.R2_PUBLIC_URL = "https://pub.r2.dev"
    vi.clearAllMocks()
    mockSend.mockResolvedValue({})
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("uploads file and returns path + publicUrl", async () => {
    const result = await saveR2File(
      "avatars/user1/img.png",
      Buffer.from("data"),
      "image/png",
    )
    expect(result.path).toBe("avatars/user1/img.png")
    expect(result.publicUrl).toBe("https://pub.r2.dev/avatars/user1/img.png")
  })

  it("strips trailing slash from public URL", async () => {
    process.env.R2_PUBLIC_URL = "https://pub.r2.dev/"
    const result = await saveR2File(
      "test.png",
      Buffer.from("data"),
      "image/png",
    )
    expect(result.publicUrl).toBe("https://pub.r2.dev/test.png")
  })

  it("sends PutObjectCommand with correct parameters", async () => {
    const buffer = Buffer.from("test-data")
    await saveR2File("test/file.png", buffer, "image/png")
    const callArg = mockSend.mock.calls[0][0]
    expect(callArg.input).toEqual({
      Bucket: "test-bucket",
      Key: "test/file.png",
      Body: buffer,
      ContentType: "image/png",
      CacheControl: "public, max-age=31536000, immutable",
    })
  })

  it("throws when R2_BUCKET_NAME is missing", async () => {
    delete process.env.R2_BUCKET_NAME
    await expect(
      saveR2File("test.png", Buffer.from(""), "image/png"),
    ).rejects.toThrow("Missing env var: R2_BUCKET_NAME")
  })

  it("throws when R2_PUBLIC_URL is missing", async () => {
    delete process.env.R2_PUBLIC_URL
    await expect(
      saveR2File("test.png", Buffer.from(""), "image/png"),
    ).rejects.toThrow("Missing env var: R2_PUBLIC_URL")
  })

  it("throws when R2 credentials are missing", async () => {
    delete process.env.R2_ACCOUNT_ID
    delete process.env.R2_ACCESS_KEY_ID
    delete process.env.R2_SECRET_ACCESS_KEY
    await expect(
      saveR2File("test.png", Buffer.from(""), "image/png"),
    ).rejects.toThrow("Missing R2 credentials")
  })
})
