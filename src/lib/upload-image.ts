"use client"

import Compressor from "compressorjs"
import { UPLOAD_MAX_DIMENSIONS, type UploadFolder } from "@/lib/storage/config"

export type UploadResult =
  | { ok: true; url: string }
  | { ok: false; error: string }

interface CompressOptions {
  quality?: number
  maxWidth?: number
  maxHeight?: number
  convertSize?: number
}

function compressImage(file: File, options: CompressOptions): Promise<File> {
  return new Promise((resolve, reject) => {
    new Compressor(file, {
      quality: options.quality ?? 0.8,
      maxWidth: options.maxWidth,
      maxHeight: options.maxHeight,
      convertSize: options.convertSize,
      success(result) {
        resolve(new File([result], file.name, { type: result.type }))
      },
      error: reject,
    })
  })
}

export async function uploadImage(
  file: File,
  folder: UploadFolder,
  compressOptions?: CompressOptions,
): Promise<UploadResult> {
  // Default the downscale target to the folder's configured max edge: avatars
  // shrink to 500px, photos to 1024px. Callers can still override explicitly.
  const maxDimension = UPLOAD_MAX_DIMENSIONS[folder]
  const options: CompressOptions = compressOptions ?? {
    maxWidth: maxDimension,
    maxHeight: maxDimension,
    convertSize: 1_000_000,
  }

  let fileToUpload: File
  try {
    fileToUpload = await compressImage(file, options)
  } catch {
    return { ok: false, error: "Could not compress the image. Try again." }
  }

  const body = new FormData()
  body.append("file", fileToUpload)
  body.append("folder", folder)

  let res: Response
  try {
    res = await fetch("/api/uploads", { method: "POST", body })
  } catch {
    return { ok: false, error: "Network error while uploading. Try again." }
  }

  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.url) {
    return { ok: false, error: data?.error ?? "Could not upload the image." }
  }
  return { ok: true, url: data.url }
}
