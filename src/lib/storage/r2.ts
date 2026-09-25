import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"

// Cloudflare R2 storage backend. Drop-in replacement for lib/storage/local.ts.
//
// R2 is S3-compatible, so we use the AWS SDK pointed at the R2 endpoint.
// Files are written to R2 under {folder}/{userId}/{uuid}.{ext} and served
// directly from R2's public URL — the app/uploads/[...path] serving route is
// no longer needed.
//
// Required env vars (add to .env and your deployment secrets):
//   R2_ACCOUNT_ID        — Cloudflare account ID (Dashboard → right sidebar)
//   R2_ACCESS_KEY_ID     — R2 API token access key
//   R2_SECRET_ACCESS_KEY — R2 API token secret key
//   R2_BUCKET_NAME       — Name of the R2 bucket
//   R2_PUBLIC_URL        — Public base URL (e.g. https://pub-xxx.r2.dev or custom domain)

function getR2Client(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Missing R2 credentials. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.",
    )
  }

  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
}

export type R2UploadResult = { path: string; publicUrl: string }

/**
 * Uploads a file to Cloudflare R2 under the given relativePath
 * (folder/userId/uuid.ext) and returns the public URL.
 */
export async function saveR2File(
  relativePath: string,
  buffer: Buffer,
  mimeType: string,
): Promise<R2UploadResult> {
  const bucket = process.env.R2_BUCKET_NAME
  const publicUrl = process.env.R2_PUBLIC_URL

  if (!bucket) throw new Error("Missing env var: R2_BUCKET_NAME")
  if (!publicUrl) throw new Error("Missing env var: R2_PUBLIC_URL")

  const client = getR2Client()

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: relativePath,
      Body: buffer,
      ContentType: mimeType,
      // UUID-named files are immutable — cache them aggressively.
      CacheControl: "public, max-age=31536000, immutable",
    }),
  )

  return {
    path: relativePath,
    publicUrl: `${publicUrl.replace(/\/$/, "")}/${relativePath}`,
  }
}

export type R2FileEntry = { key: string; size: number; lastModified: Date }

/**
 * Lists every object in the bucket as provider-relative keys, following
 * ListObjectsV2 pagination. Keys come back exactly as R2 stores them, which
 * is what saveR2File used as relativePath.
 */
export async function listR2Files(): Promise<R2FileEntry[]> {
  const bucket = process.env.R2_BUCKET_NAME
  if (!bucket) throw new Error("Missing env var: R2_BUCKET_NAME")

  const client = getR2Client()
  const files: R2FileEntry[] = []
  let continuationToken: string | undefined

  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
      }),
    )
    for (const item of page.Contents ?? []) {
      if (!item.Key) continue
      files.push({
        key: item.Key,
        size: item.Size ?? 0,
        lastModified: item.LastModified ?? new Date(0),
      })
    }
    continuationToken = page.IsTruncated
      ? page.NextContinuationToken
      : undefined
  } while (continuationToken)

  return files.sort((a, b) => a.key.localeCompare(b.key))
}

/**
 * Deletes a single object by provider-relative key. R2 treats deleting a
 * missing key as success, so this is idempotent.
 */
export async function deleteR2File(key: string): Promise<void> {
  const bucket = process.env.R2_BUCKET_NAME
  if (!bucket) throw new Error("Missing env var: R2_BUCKET_NAME")

  const client = getR2Client()
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
}
