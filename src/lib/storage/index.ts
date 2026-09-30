import {
  deleteLocalFile,
  listLocalFiles,
  readLocalFile,
  saveLocalFile,
} from "./local"
import { deleteR2File, listR2Files, readR2File, saveR2File } from "./r2"

// Unified storage entry point. Set STORAGE_PROVIDER in your .env to switch
// backends without touching any other code.
//
//   STORAGE_PROVIDER=local      — writes to disk, served via /uploads route
//   STORAGE_PROVIDER=r2         — uploads to Cloudflare R2, served from R2 URL
//
// Defaults to "local" if the var is unset, so existing dev setups keep working.

export type StorageProvider = "local" | "r2"
export type UploadResult = { path: string; publicUrl: string }
// A file as listed by listFiles(): `key` is always provider-relative (no
// leading slash) — the same form saveFile derives its public URL from.
export type StoredFile = { key: string; size: number; lastModified: Date }

function getProvider(): StorageProvider {
  const raw = (process.env.STORAGE_PROVIDER ?? "local").toLowerCase()
  if (raw === "r2") return "r2"
  if (raw === "local") return "local"
  throw new Error(
    `Unknown STORAGE_PROVIDER "${process.env.STORAGE_PROVIDER}". Must be "local" or "r2".`,
  )
}

/**
 * Saves a file using whichever backend STORAGE_PROVIDER selects and returns
 * the public URL. This is the only storage function the rest of the app
 * should import.
 */
export async function saveFile(
  relativePath: string,
  buffer: Buffer,
  mimeType: string,
): Promise<UploadResult> {
  const provider = getProvider()

  if (provider === "r2") return saveR2File(relativePath, buffer, mimeType)

  // local — mimeType is unused by the local driver but kept in the signature
  // so call sites are identical regardless of provider.
  return saveLocalFile(relativePath, buffer)
}

/**
 * Lists every stored file for whichever backend STORAGE_PROVIDER selects.
 * Used by the upload sweep (ROADMAP 5.6) to find orphaned uploads.
 */
export async function listFiles(): Promise<StoredFile[]> {
  const provider = getProvider()

  if (provider === "r2") return listR2Files()
  return listLocalFiles()
}

/**
 * Deletes a single stored file by provider-relative key. Callers are
 * responsible for deciding the file is safe to delete (see
 * lib/upload-sweep.ts).
 */
export async function deleteFile(key: string): Promise<void> {
  const provider = getProvider()

  if (provider === "r2") return deleteR2File(key)
  return deleteLocalFile(key)
}

/**
 * Reads one stored file by provider-relative key, or null when it is missing.
 * Used by app/uploads/[...path]/route.ts so owner-only folders are readable
 * whichever backend holds them.
 */
export async function readFile(
  key: string,
): Promise<{ buffer: Buffer; contentType: string | null } | null> {
  const provider = getProvider()

  if (provider === "r2") return readR2File(key)
  return readLocalFile(key)
}
