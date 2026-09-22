import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

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
