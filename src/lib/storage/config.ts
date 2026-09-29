// Shared upload config used by the local-disk storage backend
// (lib/storage/local.ts) and the upload API route. Keeping validation rules
// and the set of allowed folders here keeps them in one place.

// Allowed image content types.
export const ALLOWED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
] as const

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 // 5MB

// Folders we allow callers to upload into, so a stray value can't be used to
// scatter files across arbitrary paths.
export const UPLOAD_FOLDERS = [
  "avatars",
  "delivery-proofs",
  "pickups",
  "nids",
  "logos",
] as const
export type UploadFolder = (typeof UPLOAD_FOLDERS)[number]

// Read policy for stored files (enforced by app/uploads/[...path]/route.ts,
// ROADMAP P0.2):
//
//   public     — world-readable (merchant logos render on the public tracking
//                page, so they cannot require a session).
//   owner-only — readable by the uploader (the path's `{userId}` segment must
//                equal the session's user) or by a SUPER_ADMIN. Used for
//                identity documents and avatars.
//   everything else — any authenticated session (order proofs, pickup photos,
//                which are viewed across roles).
export const PUBLIC_UPLOAD_FOLDERS: readonly UploadFolder[] = ["logos"]

export const OWNER_ONLY_UPLOAD_FOLDERS: readonly UploadFolder[] = [
  "avatars",
  "nids",
]

// Public path prefix files are served from. Must match the location of
// app/uploads/[...path]/route.ts, which enforces the policy above.
export const UPLOADS_URL_PREFIX = "/uploads"

/** True when a folder holds files only its owner (or a SUPER_ADMIN) may read. */
export function isOwnerOnlyFolder(folder: string): boolean {
  return OWNER_ONLY_UPLOAD_FOLDERS.includes(folder as UploadFolder)
}

/**
 * True when a `folder/...` storage key belongs to an owner-only folder.
 *
 * Owner-only files must be served through the app's authenticated `/uploads`
 * route — a direct bucket URL would expose identity documents to anyone with
 * the link, no matter how the bucket is configured.
 */
export function isOwnerOnlyPath(relativePath: string): boolean {
  return isOwnerOnlyFolder(relativePath.split("/")[0] ?? "")
}

// Longest edge (px) each upload is downscaled to client-side before it's sent.
// Avatars only ever render small and square, so 500px keeps them crisp while
// staying tiny; photos (delivery proof, pickup locations) keep more detail at
// 1024px. NID documents need higher resolution for readability at 2048px.
export const UPLOAD_MAX_DIMENSIONS: Record<UploadFolder, number> = {
  avatars: 500,
  "delivery-proofs": 1024,
  pickups: 1024,
  nids: 2048,
  logos: 256,
}
