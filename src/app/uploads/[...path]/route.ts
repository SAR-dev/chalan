import { extname } from "node:path"
import { NextResponse } from "next/server"
import { requireSession } from "@/lib/api-auth"
import { forbidden, notFound, unauthorized } from "@/lib/api-response"
import { readFile } from "@/lib/storage"
import {
  OWNER_ONLY_UPLOAD_FOLDERS,
  PUBLIC_UPLOAD_FOLDERS,
  type UploadFolder,
} from "@/lib/storage/config"

// Serves stored uploads with a folder-based access policy (ROADMAP P0.2).
// Previously every stored file was world-readable, which exposed NID
// documents. Policy lives in lib/storage/config.ts:
//   - `avatars` / `nids` are readable only by their owner or a SUPER_ADMIN.
//   - everything else requires any authenticated session.
//   - `PUBLIC_UPLOAD_FOLDERS` is deliberately empty (it held `logos`, which
//     nothing uploaded to or rendered; removed with the branding feature), so
//     every stored file now needs a session.
// Auth is checked BEFORE the file is touched, so an unauthorized caller cannot
// even probe which paths exist.
//
// Reads go through lib/storage, so this route serves owner-only files from
// either backend — the R2 driver hands back an `/uploads/...` URL precisely so
// identity documents keep this check instead of a public bucket URL.

const CONTENT_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path: segments } = await params

  if (
    segments.length === 0 ||
    segments.some((s) => s === ".." || s === "." || s.includes("/") || s === "")
  ) {
    return notFound()
  }

  const folder = segments[0] as UploadFolder
  const isPublic = PUBLIC_UPLOAD_FOLDERS.includes(folder)
  const isOwnerOnly = OWNER_ONLY_UPLOAD_FOLDERS.includes(folder)

  if (!isPublic) {
    const me = await requireSession()
    if (!me) return unauthorized()
    if (isOwnerOnly && me.role !== "SUPER_ADMIN" && segments[1] !== me.userId) {
      return forbidden()
    }
  }

  const relativePath = segments.join("/")
  const file = await readFile(relativePath)
  if (!file) {
    return notFound()
  }

  const contentType =
    file.contentType ??
    CONTENT_TYPES[extname(relativePath).toLowerCase()] ??
    "application/octet-stream"

  return new NextResponse(new Uint8Array(file.buffer), {
    headers: {
      "Content-Type": contentType,
      // Public assets may be cached by shared caches; private ones stay in
      // the browser only (they are immutable by UUID naming).
      "Cache-Control": isPublic
        ? "public, max-age=31536000, immutable"
        : "private, max-age=31536000, immutable",
    },
  })
}
