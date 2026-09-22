import { mkdir, writeFile } from "node:fs/promises"
import { dirname, join, normalize, sep } from "node:path"

// Server-only local-disk storage backend. Writes files to a directory on the
// host (mounted as a Docker volume in production so uploads survive
// redeploys) and serves them back via the app/uploads/[...path] route.
//
// Saves bytes under {folder}/{userId}/{filename} and returns a public URL.
// This is the single storage backend used by app/api/uploads/route.ts.

// Where uploaded files are written inside the container/host.
// Required when STORAGE_PROVIDER=local — validated at startup in env.ts.
export const LOCAL_UPLOADS_DIR = process.env.LOCAL_UPLOADS_DIR!

// Public path prefix files are served from (handled by
// app/uploads/[...path]/route.ts). Must match that route's location.
export const UPLOADS_URL_PREFIX = "/uploads"

export type LocalUploadResult = { path: string; publicUrl: string }

/**
 * Writes a file to local disk under LOCAL_UPLOADS_DIR/{relativePath} and returns
 * the public URL it can be served from. relativePath should already be
 * sanitized (folder/userId/uuid.ext) by the caller — this function defends
 * against path traversal as a second layer, not the primary check.
 */
export async function saveLocalFile(
  relativePath: string,
  buffer: Buffer,
): Promise<LocalUploadResult> {
  const targetPath = normalize(join(LOCAL_UPLOADS_DIR, relativePath))

  // Defense in depth: refuse to write outside LOCAL_UPLOADS_DIR even if a caller
  // passed a relativePath containing "..".
  const root = normalize(LOCAL_UPLOADS_DIR + sep)
  if (!targetPath.startsWith(root)) {
    throw new Error("Refusing to write outside the uploads directory.")
  }

  await mkdir(dirname(targetPath), { recursive: true })
  await writeFile(targetPath, buffer)

  return {
    path: targetPath,
    publicUrl: `${UPLOADS_URL_PREFIX}/${relativePath}`,
  }
}
