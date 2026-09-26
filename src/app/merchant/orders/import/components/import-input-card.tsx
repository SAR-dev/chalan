"use client"

import { Download } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { MAX_BULK_ORDERS } from "@/lib/constants"
import type { ImportPhase } from "../types"

interface ImportInputCardProps {
  phase: ImportPhase
  canImport: boolean
  pasteText: string
  myLocations: Array<{ id: string; label: string }>
  cities: Array<{ id: string; name: string }>
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  onPasteChange: (value: string) => void
  onTemplateDownload: () => void
}

export function ImportInputCard({
  phase,
  canImport,
  pasteText,
  myLocations,
  cities,
  onFileChange,
  onPasteChange,
  onTemplateDownload,
}: ImportInputCardProps) {
  const isPreview =
    phase === "preview" || phase === "submitting" || phase === "error"

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

        <div className="flex flex-col gap-2">
          <Label htmlFor="bulk-import-file">CSV file</Label>
          <Input
            id="bulk-import-file"
            data-testid="bulk-import-file"
            type="file"
            accept=".csv,text/csv"
            disabled={!canImport}
            onChange={onFileChange}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="bulk-import-paste">
            Paste rows from Excel/Google Sheets
          </Label>
          <Textarea
            id="bulk-import-paste"
            data-testid="bulk-import-paste"
            value={pasteText}
            onChange={(event) => onPasteChange(event.target.value)}
            disabled={!canImport}
            rows={4}
            placeholder="Paste the header row plus your data rows (tab or comma separated)…"
          />
          {isPreview ? (
            <p className="text-muted-foreground text-xs">
              Click any cell below to fix it in place, paste the corrected rows,
              or re-upload the saved file.
            </p>
          ) : null}
        </div>

        {phase === "idle" ? (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="bulk-import-template"
                onClick={onTemplateDownload}
              >
                <Download className="size-4" />
                Download template
              </Button>
              <p className="text-muted-foreground text-xs">
                Up to {MAX_BULK_ORDERS} rows · 2 MB · UTF-8 CSV only
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <p className="text-muted-foreground text-xs font-medium">
                  Pickup locations
                </p>
                <ul className="flex flex-col gap-1 text-sm">
                  {myLocations.map((location) => (
                    <li key={location.id} className="truncate">
                      {location.label}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-muted-foreground text-xs font-medium">
                  Delivery cities
                </p>
                <ul className="flex flex-col gap-1 text-sm">
                  {cities.map((city) => (
                    <li key={city.id} className="truncate">
                      {city.name}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}
