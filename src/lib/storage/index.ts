import { saveLocalFile } from "./local"
import { saveR2File } from "./r2"
import { saveSupabaseFile } from "./supabase"

// Unified storage entry point. Set STORAGE_PROVIDER in your .env to switch
// backends without touching any other code.
//
//   STORAGE_PROVIDER=local      — writes to disk, served via /uploads route
//   STORAGE_PROVIDER=r2         — uploads to Cloudflare R2, served from R2 URL
//   STORAGE_PROVIDER=supabase   — uploads to Supabase Storage, served from bucket URL
//
// Defaults to "local" if the var is unset, so existing dev setups keep working.

export type StorageProvider = "local" | "r2" | "supabase"
export type UploadResult = { path: string; publicUrl: string }

function getProvider(): StorageProvider {
  const raw = (process.env.STORAGE_PROVIDER ?? "local").toLowerCase()
  if (raw === "r2") return "r2"
  if (raw === "local") return "local"
  if (raw === "supabase") return "supabase"
  throw new Error(
    `Unknown STORAGE_PROVIDER "${process.env.STORAGE_PROVIDER}". Must be "local", "r2", or "supabase".`,
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
  if (provider === "supabase")
    return saveSupabaseFile(relativePath, buffer, mimeType)

  // local — mimeType is unused by the local driver but kept in the signature
  // so call sites are identical regardless of provider.
  return saveLocalFile(relativePath, buffer)
}
