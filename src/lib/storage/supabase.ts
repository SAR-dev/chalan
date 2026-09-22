import { createClient } from "@supabase/supabase-js"

// Required env vars:
//   SUPABASE_URL           — e.g. https://xyzxyz.supabase.co
//   SUPABASE_SERVICE_KEY   — service_role key (not the anon key)
//   SUPABASE_BUCKET        — e.g. "uploads"
//   SUPABASE_PUBLIC_URL    — e.g. https://xyzxyz.supabase.co/storage/v1/object/public/uploads

function getClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key)
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
  return createClient(url, key)
}

export type SupabaseUploadResult = { path: string; publicUrl: string }

export async function saveSupabaseFile(
  relativePath: string,
  buffer: Buffer,
  mimeType: string,
): Promise<SupabaseUploadResult> {
  const bucket = process.env.SUPABASE_BUCKET
  const publicBase = process.env.SUPABASE_PUBLIC_URL
  if (!bucket) throw new Error("Missing env var: SUPABASE_BUCKET")
  if (!publicBase) throw new Error("Missing env var: SUPABASE_PUBLIC_URL")

  const client = getClient()

  const { error } = await client.storage
    .from(bucket)
    .upload(relativePath, buffer, {
      contentType: mimeType,
      upsert: false, // files are UUID-named, never collide
      cacheControl: "31536000", // 1 year, immutable
    })

  if (error) throw new Error(`Supabase upload failed: ${error.message}`)

  return {
    path: relativePath,
    publicUrl: `${publicBase.replace(/\/$/, "")}/${relativePath}`,
  }
}
