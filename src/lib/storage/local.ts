import { mkdir, readdir, stat, unlink, writeFile } from "node:fs/promises"
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

export type LocalFileEntry = { key: string; size: number; lastModified: Date }

/**
 * Lists every file under LOCAL_UPLOADS_DIR as provider-relative keys
 * (posix separators, no leading slash — the inverse of saveLocalFile's
 * publicUrl). Missing directory counts as empty so a fresh install can run
 * the upload sweep before anything has been uploaded.
 */
export async function listLocalFiles(): Promise<LocalFileEntry[]> {
  let names: string[]
  try {
    names = await readdir(LOCAL_UPLOADS_DIR, { recursive: true })
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return []
    throw err
  }

  const root = normalize(LOCAL_UPLOADS_DIR + sep)
  const files: LocalFileEntry[] = []
  for (const name of names) {
    const targetPath = normalize(join(LOCAL_UPLOADS_DIR, name))
    if (!targetPath.startsWith(root)) continue
    try {
      const fileStat = await stat(targetPath)
      if (!fileStat.isFile()) continue
      files.push({
        key: name.split(/[/\\]/).join("/"),
        size: fileStat.size,
        lastModified: fileStat.mtime,
      })
    } catch {
      // File vanished between readdir and stat — skip it.
    }
  }
  return files.sort((a, b) => a.key.localeCompare(b.key))
}

/**
 * Deletes a single file by provider-relative key. Refuses any key that would
 * resolve outside LOCAL_UPLOADS_DIR (same traversal defense as the
 * app/uploads/[...path] serving route).
 */
export async function deleteLocalFile(key: string): Promise<void> {
  const segments = key.split("/")
  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        segment === "" ||
        segment === "." ||
        segment === ".." ||
        segment.includes(sep),
    )
  ) {
    throw new Error("Refusing to delete outside the uploads directory.")
  }

  const targetPath = normalize(join(LOCAL_UPLOADS_DIR, ...segments))
  const root = normalize(LOCAL_UPLOADS_DIR + sep)
  if (!targetPath.startsWith(root)) {
    throw new Error("Refusing to delete outside the uploads directory.")
  }

  await unlink(targetPath)
}
