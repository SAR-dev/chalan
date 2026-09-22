import { readFile, stat } from "node:fs/promises"
import { extname, join, normalize, sep } from "node:path"
import { NextResponse } from "next/server"
import { notFound } from "@/lib/api-response"
import { LOCAL_UPLOADS_DIR } from "@/lib/storage/local"

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
    segments.some((s) => s === ".." || s === "." || s.includes(sep))
  ) {
    return notFound()
  }

  const relativePath = segments.join("/")
  const targetPath = normalize(join(LOCAL_UPLOADS_DIR, relativePath))
  const root = normalize(LOCAL_UPLOADS_DIR + sep)
  if (!targetPath.startsWith(root)) {
    return notFound()
  }

  try {
    const fileStat = await stat(targetPath)
    if (!fileStat.isFile()) {
      return notFound()
    }
    const buffer = await readFile(targetPath)
    const contentType =
      CONTENT_TYPES[extname(targetPath).toLowerCase()] ??
      "application/octet-stream"

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  } catch {
    return notFound()
  }
}
