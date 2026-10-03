import { randomUUID } from "node:crypto"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import {
  badRequest,
  forbidden,
  serverError,
  unauthorized,
} from "@/lib/api-response"
import { IMAGE_EXTENSION, sniffImageType } from "@/lib/image-signature"
import { rateLimitByIp } from "@/lib/rate-limit"
import { saveFile } from "@/lib/storage"
import {
  ALLOWED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
  UPLOAD_FOLDERS,
  type UploadFolder,
} from "@/lib/storage/config"
import { verifyUploadToken } from "@/lib/upload-token"
import { withErrorHandler } from "@/lib/with-error-handler"

// Accepts a single image file (multipart/form-data) and stores it, returning
// the URL it is served from.
//
// Authorization:
//   - A signed-in user uploads into their own `{folder}/{userId}/` namespace.
//   - The only anonymous flow is the rider-application NID upload, which must
//     present a short-lived signed token from POST /api/uploads/token.
//
// The storage backend is selected by STORAGE_PROVIDER in .env:
//   local — writes to disk, served via app/uploads/[...path]/route.ts
//   r2    — uploads to Cloudflare R2 (bucket MUST be private for NID folders)

// Multipart framing (boundaries + part headers) rides on top of the file bytes.
const MULTIPART_OVERHEAD_BYTES = 64 * 1024

/** Anonymous upload budget, per IP, per minute — unchanged from before. */
const UPLOAD_LIMIT = 20
const UPLOAD_WINDOW_SECONDS = 60

export const POST = withErrorHandler(async (req: Request) => {
  // Throttle first: a request we are going to reject should cost as little as
  // possible to reach this line, and it must happen before the body is read.
  //
  // This used to live in `src/proxy.ts` — Next's *middleware* — with its own
  // in-process Map. Middleware cannot reach the Redis-backed limiter the rest
  // of the app shares, so in `docker/compose.cluster.yml` each of the four
  // instances enforced its own 20/min budget: 80 uploads/min/IP against a
  // 20/min intent, while every other route in the app was correctly shared
  //. Route handlers run on the Node runtime, so the shared
  // limiter is available here.
  //
  // `failClosed` stays off deliberately: with no resolvable IP this would put
  // every unidentifiable visitor in one bucket, and a single such visitor could
  // then block uploads for everyone else (cross-tenant DoS).
  const limited = await rateLimitByIp(
    req,
    "upload",
    UPLOAD_LIMIT,
    UPLOAD_WINDOW_SECONDS,
  )
  if (limited) return limited

  // Bound the request BEFORE parsing it: route handlers buffer formData()
  // fully, so an unbounded body is a memory-exhaustion vector.
  const contentLength = Number(req.headers.get("content-length"))
  if (!Number.isFinite(contentLength) || contentLength <= 0) {
    return NextResponse.json(
      { error: "A Content-Length header is required." },
      { status: 411 },
    )
  }
  if (contentLength > MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES) {
    return NextResponse.json(
      { error: "Image must be 5MB or smaller." },
      { status: 413 },
    )
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return badRequest("Expected multipart form data.")
  }

  const file = formData.get("file")
  const folderRaw = String(formData.get("folder") ?? "")

  if (!(file instanceof File)) {
    return badRequest("No file provided.")
  }
  if (!UPLOAD_FOLDERS.includes(folderRaw as UploadFolder)) {
    return badRequest("Invalid folder.")
  }
  const folder = folderRaw as UploadFolder

  if (file.size > MAX_UPLOAD_BYTES) {
    return badRequest("Image must be 5MB or smaller.")
  }

  // Authorization: a session uploads as itself; the anonymous rider-application
  // flow must present a valid upload token (only the `nids` folder).
  const me = await requireSession()
  let subject: string
  if (me) {
    subject = me.userId
  } else {
    if (folder !== "nids") return unauthorized()
    const token = String(formData.get("uploadToken") ?? "")
    if (!verifyUploadToken(token, "nids")) {
      return forbidden("A valid upload token is required.")
    }
    subject = "public"
  }

  // Trust the bytes, not the client: sniff the magic bytes and store the file
  // as what it actually is (type + extension both derived from the sniff).
  const buffer = Buffer.from(await file.arrayBuffer())
  const sniffed = sniffImageType(buffer)
  if (!sniffed || !ALLOWED_IMAGE_TYPES.includes(sniffed)) {
    return badRequest("Only PNG, JPG, WEBP, or GIF images are allowed.")
  }

  const path = `${folder}/${subject}/${randomUUID()}.${IMAGE_EXTENSION[sniffed]}`

  try {
    const { publicUrl } = await saveFile(path, buffer, sniffed)
    return NextResponse.json({ url: publicUrl })
  } catch {
    return serverError("Could not upload the image. Please try again.")
  }
})
