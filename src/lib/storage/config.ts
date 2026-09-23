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
