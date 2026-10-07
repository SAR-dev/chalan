"use client"

import { ChevronDown, Copy, Download, FileText, Upload } from "lucide-react"
import Link from "next/link"
import { useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { MAX_BULK_ORDERS } from "@/lib/constants"
import { toast } from "@/lib/notify"
import { cn } from "@/lib/utils"
import type { ImportPhase } from "../types"

interface ImportInputCardProps {
  phase: ImportPhase
  canImport: boolean
  myLocations: Array<{ id: string; label: string }>
  cities: Array<{ id: string; name: string }>
  sourceFileName: string | null
  sourceRowCount: number
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  onFileDrop: (file: File) => void
  onTemplateDownload: () => void
}

export function ImportInputCard({
  phase,
  canImport,
  myLocations,
  cities,
  sourceFileName,
  sourceRowCount,
  onFileChange,
  onFileDrop,
  onTemplateDownload,
}: ImportInputCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [cityQuery, setCityQuery] = useState("")
  const hasSource = sourceFileName !== null && sourceRowCount > 0

  const trimmedQuery = cityQuery.trim().toLowerCase()
  const filteredCities = trimmedQuery
    ? cities.filter((city) => city.name.toLowerCase().includes(trimmedQuery))
    : cities

  function copyPickupName(label: string) {
    navigator.clipboard
      .writeText(label)
      .then(() => toast.success("Pickup location name copied."))
      .catch(() => toast.error("Could not copy the name."))
  }

  function openFilePicker() {
    if (!canImport) return
    fileInputRef.current?.click()
  }

  function handleDrop(event: React.DragEvent<HTMLButtonElement>) {
    event.preventDefault()
    setDragging(false)
    if (!canImport) return
    const file = event.dataTransfer.files?.[0]
    if (file) onFileDrop(file)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import from CSV</CardTitle>
        <CardDescription>
          Download the template, fill in one row per order, then preview every
          row. Nothing is created until the whole file is error-free.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <input
          ref={fileInputRef}
          id="bulk-import-file"
          data-testid="bulk-import-file"
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          disabled={!canImport}
          onChange={onFileChange}
        />

        {!canImport ? (
          <div className="border-border flex flex-col items-start gap-2 rounded-lg border border-dashed p-4">
            <p className="text-sm font-medium">Add a pickup location first</p>
            <p className="text-muted-foreground text-sm">
              Every imported order needs a pickup location for your shop.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              render={<Link href="/merchant/settings" />}
              nativeButton={false}
            >
              Add pickup location
            </Button>
          </div>
        ) : null}

        {hasSource ? (
          <div className="border-border flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
            <span className="flex min-w-0 items-center gap-2">
              <FileText
                className="text-muted-foreground size-4 shrink-0"
                aria-hidden="true"
              />
              <span className="truncate text-sm font-medium">
                {sourceFileName}
              </span>
              <span className="text-muted-foreground text-sm">
                · {sourceRowCount} rows
              </span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canImport}
              onClick={openFilePicker}
            >
              <Upload className="size-4" aria-hidden="true" />
              Replace file
            </Button>
          </div>
        ) : (
          <>
            <button
              type="button"
              disabled={!canImport}
              onClick={openFilePicker}
              onDragOver={(event) => {
                event.preventDefault()
                if (canImport) setDragging(true)
              }}
              onDragLeave={(event) => {
                const next = event.relatedTarget
                if (next instanceof Node && event.currentTarget.contains(next))
                  return
                setDragging(false)
              }}
              onDrop={handleDrop}
              className={cn(
                "border-border text-muted-foreground flex min-h-36 w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed px-4 py-6 text-center outline-none transition-colors hover:border-primary/50 hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50",
                dragging && "border-primary bg-primary/5",
              )}
            >
              <Upload className="size-6" aria-hidden="true" />
              <span className="text-foreground text-sm font-medium">
                Drop your CSV here or click to browse
              </span>
              <span className="text-xs">One row per order · CSV UTF-8</span>
            </button>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <Button
                type="button"
                variant="outline"
                data-testid="bulk-import-template"
                className="w-full sm:w-auto"
                onClick={onTemplateDownload}
              >
                <Download className="size-4" />
                Download template
              </Button>
              <p className="text-muted-foreground text-xs">
                Up to {MAX_BULK_ORDERS} rows · 2 MB · UTF-8 CSV only
              </p>
            </div>
          </>
        )}

        {phase === "idle" ? (
          <details className="group text-sm">
            <summary className="text-foreground inline-flex cursor-pointer list-none items-center gap-1.5 font-medium [&::-webkit-details-marker]:hidden">
              <ChevronDown
                className="text-muted-foreground size-4 transition-transform group-open:rotate-180"
                aria-hidden="true"
              />
              Where do my values need to match?
            </summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border p-3 h-64 overflow-y-auto">
                <p className="text-muted-foreground text-xs font-medium">
                  Pickup locations
                </p>
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {myLocations.map((location) => (
                    <li
                      key={location.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="truncate">{location.label}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Copy name: ${location.label}`}
                        data-testid={`bulk-import-copy-pickup-${location.id}`}
                        onClick={() => copyPickupName(location.label)}
                      >
                        <Copy className="size-3.5" aria-hidden="true" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex flex-col gap-1 rounded-lg border p-3 h-64 overflow-y-auto">
                <p className="text-muted-foreground text-xs font-medium">
                  Delivery cities
                </p>
                <Input
                  data-testid="bulk-import-city-search"
                  aria-label="Search delivery cities"
                  placeholder="Search cities…"
                  value={cityQuery}
                  onChange={(event) => setCityQuery(event.target.value)}
                />
                <ul className="mt-2 flex max-h-44 flex-col gap-1">
                  {filteredCities.map((city) => (
                    <li key={city.id} className="truncate">
                      {city.name}
                    </li>
                  ))}
                  {filteredCities.length === 0 ? (
                    <li className="text-muted-foreground text-xs italic">
                      No matching cities.
                    </li>
                  ) : null}
                </ul>
              </div>
            </div>
          </details>
        ) : null}
      </CardContent>
    </Card>
  )
}
