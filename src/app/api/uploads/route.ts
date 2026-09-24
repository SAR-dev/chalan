import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { badRequest, serverError, unauthorized } from "@/lib/api-response"
import { saveFile } from "@/lib/storage"
import {
  ALLOWED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  UPLOAD_FOLDERS,
  type UploadFolder,
} from "@/lib/storage/config"
import { withErrorHandler } from "@/lib/with-error-handler"

// Accepts a single image file (multipart/form-data) and stores it, returning
// the public URL. Any signed-in user may upload, since this backs avatars,
// delivery proof, and pickup-location photos.
//
// The "nids" folder is public — unauthenticated users can upload NID images
// during the rider application flow.
//
// The storage backend is selected by STORAGE_PROVIDER in .env:
//   local — writes to disk, served via app/uploads/[...path]/route.ts
//   r2    — uploads to Cloudflare R2, served from R2's public URL

export const POST = withErrorHandler(async (req: Request) => {
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return badRequest("Expected multipart form data.")
  }

  const file = formData.get("file")
  const folderRaw = String(formData.get("folder") ?? "avatars")

  if (!(file instanceof File)) {
    return badRequest("No file provided.")
  }
  if (!UPLOAD_FOLDERS.includes(folderRaw as UploadFolder)) {
    return badRequest("Invalid folder.")
  }
  if (
    !ALLOWED_IMAGE_TYPES.includes(
      file.type as (typeof ALLOWED_IMAGE_TYPES)[number],
    )
  ) {
    return badRequest("Only PNG, JPG, WEBP, or GIF images are allowed.")
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return badRequest("Image must be 5MB or smaller.")
  }

  // The "nids" folder is public for rider applications. All other folders
  // require an authenticated session.
  const isPublicNid = folderRaw === "nids"
  let userId = "public"
  if (!isPublicNid) {
    const me = await requireSession()
    if (!me) return unauthorized()
    userId = me.userId
  }

  const rawExt = file.name.includes(".")
    ? file.name.split(".").pop()!.toLowerCase()
    : (file.type.split("/").pop() ?? "bin")
  const ext = (rawExt.replace(/[^a-z0-9]/g, "") || "bin").slice(0, 10)
  const path = `${folderRaw}/${userId}/${randomUUID()}.${ext}`
  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    const { publicUrl } = await saveFile(path, buffer, file.type)
    return NextResponse.json({ url: publicUrl })
  } catch {
    return serverError("Could not upload the image. Please try again.")
  }
})
