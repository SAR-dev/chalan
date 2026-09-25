import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mockSend = vi.fn().mockResolvedValue({})

vi.mock("@aws-sdk/client-s3", () => {
  class MockS3Client {
    send = mockSend
  }
  function commandFor(kind: string) {
    return class {
      kind = kind
      input: unknown
      constructor(input: unknown) {
        this.input = input
      }
    }
  }
  return {
    S3Client: MockS3Client,
    PutObjectCommand: commandFor("PutObject"),
    ListObjectsV2Command: commandFor("ListObjectsV2"),
    DeleteObjectCommand: commandFor("DeleteObject"),
  }
})

import { deleteR2File, listR2Files, saveR2File } from "./r2"

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

describe("listR2Files", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.R2_ACCOUNT_ID = "test-account"
    process.env.R2_ACCESS_KEY_ID = "test-key"
    process.env.R2_SECRET_ACCESS_KEY = "test-secret"
    process.env.R2_BUCKET_NAME = "test-bucket"
    vi.clearAllMocks()
    mockSend.mockResolvedValue({ Contents: [], IsTruncated: false })
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("returns keys with size and lastModified, sorted", async () => {
    const modified = new Date("2026-01-01T00:00:00.000Z")
    mockSend.mockResolvedValue({
      Contents: [
        { Key: "nids/u1/b.png", Size: 2, LastModified: modified },
        { Key: "avatars/u1/a.png", Size: 1, LastModified: modified },
        { Size: 9 },
      ],
      IsTruncated: false,
    })

    const files = await listR2Files()

    expect(files).toEqual([
      { key: "avatars/u1/a.png", size: 1, lastModified: modified },
      { key: "nids/u1/b.png", size: 2, lastModified: modified },
    ])
    const callArg = mockSend.mock.calls[0][0]
    expect(callArg.kind).toBe("ListObjectsV2")
    expect(callArg.input).toEqual({
      Bucket: "test-bucket",
      ContinuationToken: undefined,
    })
  })

  it("follows pagination via ContinuationToken", async () => {
    const modified = new Date("2026-01-01T00:00:00.000Z")
    mockSend
      .mockResolvedValueOnce({
        Contents: [{ Key: "a.png", Size: 1, LastModified: modified }],
        IsTruncated: true,
        NextContinuationToken: "page-2",
      })
      .mockResolvedValueOnce({
        Contents: [{ Key: "b.png", Size: 2, LastModified: modified }],
        IsTruncated: false,
      })

    const files = await listR2Files()

    expect(files.map((file) => file.key)).toEqual(["a.png", "b.png"])
    expect(mockSend).toHaveBeenCalledTimes(2)
    const secondCall = mockSend.mock.calls[1][0]
    expect(secondCall.input).toEqual({
      Bucket: "test-bucket",
      ContinuationToken: "page-2",
    })
  })

  it("throws when R2_BUCKET_NAME is missing", async () => {
    delete process.env.R2_BUCKET_NAME
    await expect(listR2Files()).rejects.toThrow(
      "Missing env var: R2_BUCKET_NAME",
    )
  })

  it("throws when R2 credentials are missing", async () => {
    delete process.env.R2_ACCOUNT_ID
    await expect(listR2Files()).rejects.toThrow("Missing R2 credentials")
  })
})

describe("deleteR2File", () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    process.env.R2_ACCOUNT_ID = "test-account"
    process.env.R2_ACCESS_KEY_ID = "test-key"
    process.env.R2_SECRET_ACCESS_KEY = "test-secret"
    process.env.R2_BUCKET_NAME = "test-bucket"
    vi.clearAllMocks()
    mockSend.mockResolvedValue({})
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it("sends DeleteObjectCommand with bucket + key", async () => {
    await deleteR2File("avatars/u1/a.png")

    expect(mockSend).toHaveBeenCalledTimes(1)
    const callArg = mockSend.mock.calls[0][0]
    expect(callArg.kind).toBe("DeleteObject")
    expect(callArg.input).toEqual({
      Bucket: "test-bucket",
      Key: "avatars/u1/a.png",
    })
  })

  it("throws when R2_BUCKET_NAME is missing", async () => {
    delete process.env.R2_BUCKET_NAME
    await expect(deleteR2File("a.png")).rejects.toThrow(
      "Missing env var: R2_BUCKET_NAME",
    )
  })
})
