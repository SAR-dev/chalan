"use client"

import { ImageIcon, Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { useRef, useState } from "react"
import { ImageZoom } from "@/components/image-zoom"
import { Button } from "@/components/ui/button"
import { toast } from "@/lib/notify"
import type { UploadFolder } from "@/lib/storage/config"
import { uploadImage } from "@/lib/upload-image"
import { cn } from "@/lib/utils"

// --- Single image uploader (used for avatar + delivery proof) ---------------

/** A token, or a provider that fetches a fresh one (for anonymous flows). */
export type UploadTokenSource = string | (() => Promise<string | null>)

export function ImageUpload({
  value,
  onChange,
  folder,
  disabled,
  label = "Upload image",
  className,
  previewClassName,
  hidePreview = false,
  uploadToken,
}: {
  value: string | null | undefined
  onChange: (url: string | null) => void
  folder: UploadFolder
  disabled?: boolean
  label?: string
  className?: string
  previewClassName?: string
  hidePreview?: boolean
  /**
   * Authorization for anonymous uploads (rider-application NIDs): either a
   * token or a provider that fetches a fresh one per upload.
   */
  uploadToken?: UploadTokenSource
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleFile(file: File | undefined) {
    if (!file) return
    setUploading(true)
    try {
      const token =
        typeof uploadToken === "function" ? await uploadToken() : uploadToken
      const result = await uploadImage(
        file,
        folder,
        undefined,
        token ?? undefined,
      )
      if (result.ok) {
        onChange(result.url)
      } else {
        toast.error(result.error)
      }
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="sr-only"
        onChange={(e) => handleFile(e.target.files?.[0])}
        disabled={disabled || uploading}
      />
      {value && !hidePreview ? (
        <div className="border-border group relative flex-1 overflow-hidden rounded-lg border">
          <ImageZoom asChild src={value} alt="Uploaded preview">
            <button
              type="button"
              className="hover:cursor-zoom-in block h-full w-full"
              title="View image"
            >
              <img
                src={value}
                alt="Uploaded preview"
                className={cn("h-full w-full object-cover", previewClassName)}
              />
            </button>
          </ImageZoom>
          {/* Corner actions — image click opens the zoom modal; buttons reveal
              on hover (always visible on touch devices) */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-1.5">
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="pointer-events-auto pointer-coarse:opacity-100 size-7 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || uploading}
              aria-label="Replace image"
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Pencil className="size-4" />
              )}
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="pointer-events-auto pointer-coarse:opacity-100 size-7 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => onChange(null)}
              disabled={disabled || uploading}
              aria-label="Remove image"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
          {/* Uploading overlay */}
          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50">
              <Loader2 className="text-white size-6 animate-spin" />
            </div>
          )}
        </div>
      ) : value && hidePreview ? (
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || uploading}
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Pencil className="size-4" />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(null)}
              disabled={disabled || uploading}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || uploading}
          className="border-border text-muted-foreground hover:border-primary/50 hover:text-foreground flex min-h-28 w-full flex-1 flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60"
        >
          {uploading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <ImageIcon className="size-5" />
          )}
          <span>{uploading ? "Uploading…" : label}</span>
          <span className="px-1 text-xs">PNG, JPG, WEBP up to 5MB</span>
        </button>
      )}
    </div>
  )
}

// --- Multi-image uploader (used for pickup-location photos) -----------------

export function ImageGalleryUpload({
  value,
  onChange,
  folder,
  max = 10,
  disabled,
}: {
  value: string[]
  onChange: (urls: string[]) => void
  folder: UploadFolder
  max?: number
  disabled?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const atMax = value.length >= max

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    const remaining = max - value.length
    const selected = Array.from(files).slice(0, remaining)
    if (selected.length === 0) {
      toast.error(`You can add up to ${max} photos.`)
      return
    }
    setUploading(true)
    try {
      const uploaded: string[] = []
      for (const file of selected) {
        const result = await uploadImage(file, folder)
        if (result.ok) {
          uploaded.push(result.url)
        } else {
          toast.error(result.error)
        }
      }
      if (uploaded.length > 0) onChange([...value, ...uploaded])
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  function removeAt(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  return (
    <div className="flex flex-col gap-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        multiple
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
        disabled={disabled || uploading || atMax}
      />
      {value.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {value.map((url, index) => (
            <div
              key={url}
              className="group border-border relative aspect-square overflow-hidden rounded-lg border"
            >
              <ImageZoom
                src={url}
                alt={`Photo ${index + 1}`}
                className="size-full object-cover"
              />
              <button
                type="button"
                onClick={() => removeAt(index)}
                disabled={disabled || uploading}
                aria-label={`Remove photo ${index + 1}`}
                className="bg-background/80 text-foreground hover:bg-destructive hover:text-destructive-foreground pointer-coarse:opacity-100 absolute top-1 right-1 inline-flex size-6 items-center justify-center rounded-md opacity-0 backdrop-blur-sm transition group-hover:opacity-100 focus-visible:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || uploading || atMax}
      >
        {uploading ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Uploading
          </>
        ) : (
          <>
            <Plus className="size-3.5" /> Add photos
          </>
        )}
      </Button>
      <p className="text-muted-foreground text-xs">
        {atMax
          ? `Maximum of ${max} photos reached.`
          : `Up to ${max} photos, PNG/JPG/WEBP up to 5MB each.`}
      </p>
    </div>
  )
}
