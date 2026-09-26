"use client"

import { useRef, useState } from "react"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type {
  ResolvedRow,
  ResolveLookups,
} from "@/features/orders/bulk-import/resolve-rows"
import type { OrderImportHeader } from "@/features/orders/bulk-import/template"
import {
  ORDER_DELIVERY_TYPE_LABELS,
  ORDER_DELIVERY_TYPES,
} from "@/lib/constants"
import { cn } from "@/lib/utils"

const FIELD_LABELS: Record<OrderImportHeader, string> = {
  pickup_location: "Pickup location",
  recipient_name: "Recipient name",
  recipient_phone: "Recipient phone",
  delivery_city: "Delivery city",
  delivery_address: "Delivery address",
  parcel_weight_kg: "Parcel weight",
  product_cost: "Product cost",
  delivery_type: "Delivery type",
  delivery_map_link: "Delivery map link",
  merchant_note: "Merchant note",
}

type CellChange = (
  line: number,
  field: OrderImportHeader,
  value: string,
) => void

interface SelectOption {
  value: string
  label: string
}

interface TextCellProps {
  line: number
  field: OrderImportHeader
  value: string
  onCellChange: CellChange
  align?: "left" | "right"
  inputMode?: "text" | "tel" | "decimal" | "numeric" | "url"
  placeholder?: string
}

function TextCell({
  line,
  field,
  value,
  onCellChange,
  align = "left",
  inputMode = "text",
  placeholder = "—",
}: TextCellProps) {
  const label = FIELD_LABELS[field]
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const originalRef = useRef(value)

  function startEdit() {
    originalRef.current = value
    setDraft(value)
    setEditing(true)
  }

  function commit(next: string) {
    setDraft(next)
    onCellChange(line, field, next)
  }

  function cancel() {
    setDraft(originalRef.current)
    onCellChange(line, field, originalRef.current)
    setEditing(false)
  }

  if (editing) {
    return (
      <Input
        autoFocus
        data-testid={`bulk-import-cell-input-${line}-${field}`}
        aria-label={`${label} for row ${line}`}
        value={draft}
        inputMode={inputMode}
        className={cn("min-w-28", align === "right" && "text-right")}
        onChange={(event) => commit(event.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            setEditing(false)
          } else if (event.key === "Escape") {
            event.preventDefault()
            cancel()
          }
        }}
      />
    )
  }

  const display = value.trim()
  return (
    <button
      type="button"
      data-testid={`bulk-import-cell-${line}-${field}`}
      aria-label={`Edit ${label} for row ${line}`}
      onClick={startEdit}
      className={cn(
        "hover:bg-muted focus-visible:ring-ring/50 w-full rounded-md px-1.5 py-1 text-left hover:focus-visible:ring-2 focus:outline-none",
        align === "right" && "text-right tabular-nums",
        !display && "text-muted-foreground",
      )}
    >
      {display || placeholder}
    </button>
  )
}

interface SelectCellProps {
  line: number
  field: OrderImportHeader
  value: string
  options: SelectOption[]
  onCellChange: CellChange
  placeholder?: string
}

function SelectCell({
  line,
  field,
  value,
  options,
  onCellChange,
  placeholder = "—",
}: SelectCellProps) {
  const label = FIELD_LABELS[field]
  const [editing, setEditing] = useState(false)
  const originalRef = useRef(value)

  const isKnown = options.some((option) => option.value === value)
  const editOptions =
    value !== "" && !isKnown ? [{ value, label: value }, ...options] : options

  function startEdit() {
    originalRef.current = value
    setEditing(true)
  }

  if (editing) {
    return (
      <select
        autoFocus
        data-testid={`bulk-import-cell-input-${line}-${field}`}
        aria-label={`${label} for row ${line}`}
        value={value}
        onChange={(event) => onCellChange(line, field, event.target.value)}
        onBlur={() => setEditing(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            onCellChange(line, field, originalRef.current)
            setEditing(false)
          }
        }}
        className="border-input bg-background focus-visible:ring-ring/50 h-8 w-full min-w-28 rounded-md border px-2 text-sm focus-visible:ring-2 focus:outline-none"
      >
        <option value="">{placeholder}</option>
        {editOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    )
  }

  const current = options.find((option) => option.value === value)
  const display = current ? current.label : value.trim()
  return (
    <button
      type="button"
      data-testid={`bulk-import-cell-${line}-${field}`}
      aria-label={`Edit ${label} for row ${line}`}
      onClick={startEdit}
      className={cn(
        "hover:bg-muted focus-visible:ring-ring/50 w-full rounded-md px-1.5 py-1 text-left hover:focus-visible:ring-2 focus:outline-none",
        !display && "text-muted-foreground",
      )}
    >
      {display || placeholder}
    </button>
  )
}

interface ImportPreviewTableProps {
  rows: ResolvedRow[]
  serverErrors: Record<number, string[]>
  lookups: ResolveLookups
  onCellChange: CellChange
}

export function ImportPreviewTable({
  rows,
  serverErrors,
  lookups,
  onCellChange,
}: ImportPreviewTableProps) {
  const pickupOptions = lookups.pickupLocations.map((pickup) => ({
    value: pickup.name,
    label: pickup.name,
  }))
  const cityOptions = lookups.deliveryCities.map((city) => ({
    value: city.name,
    label: city.name,
  }))
  const typeOptions = ORDER_DELIVERY_TYPES.map((type) => ({
    value: type,
    label: ORDER_DELIVERY_TYPE_LABELS[type],
  }))

  return (
    <div
      data-testid="bulk-import-preview"
      className="overflow-x-auto rounded-lg border"
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-12">Row</TableHead>
            <TableHead>Recipient</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Pickup</TableHead>
            <TableHead>City</TableHead>
            <TableHead>Address</TableHead>
            <TableHead className="text-right">Weight</TableHead>
            <TableHead className="text-right">COD</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Map link</TableHead>
            <TableHead>Note</TableHead>
            <TableHead>Errors</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => {
            const rowErrors = [...row.errors, ...(serverErrors[row.line] ?? [])]
            const hasErrors = rowErrors.length > 0
            return (
              <TableRow
                key={row.line}
                data-testid={`bulk-import-row-${row.line}`}
                className={
                  hasErrors ? "border-destructive bg-destructive/5" : undefined
                }
              >
                <TableCell className="font-mono text-xs">{row.line}</TableCell>
                <TableCell className="min-w-32">
                  <TextCell
                    line={row.line}
                    field="recipient_name"
                    value={row.raw.recipient_name}
                    onCellChange={onCellChange}
                  />
                </TableCell>
                <TableCell className="min-w-28">
                  <TextCell
                    line={row.line}
                    field="recipient_phone"
                    value={row.raw.recipient_phone}
                    onCellChange={onCellChange}
                    inputMode="tel"
                  />
                </TableCell>
                <TableCell className="min-w-36">
                  <SelectCell
                    line={row.line}
                    field="pickup_location"
                    value={row.raw.pickup_location}
                    options={pickupOptions}
                    onCellChange={onCellChange}
                  />
                </TableCell>
                <TableCell className="min-w-28">
                  <SelectCell
                    line={row.line}
                    field="delivery_city"
                    value={row.raw.delivery_city}
                    options={cityOptions}
                    onCellChange={onCellChange}
                  />
                </TableCell>
                <TableCell className="min-w-44 max-w-64 whitespace-normal">
                  <TextCell
                    line={row.line}
                    field="delivery_address"
                    value={row.raw.delivery_address}
                    onCellChange={onCellChange}
                  />
                </TableCell>
                <TableCell className="min-w-24 text-right">
                  <TextCell
                    line={row.line}
                    field="parcel_weight_kg"
                    value={row.raw.parcel_weight_kg}
                    onCellChange={onCellChange}
                    align="right"
                    inputMode="decimal"
                  />
                </TableCell>
                <TableCell className="min-w-24 text-right">
                  <TextCell
                    line={row.line}
                    field="product_cost"
                    value={row.raw.product_cost}
                    onCellChange={onCellChange}
                    align="right"
                    inputMode="numeric"
                  />
                </TableCell>
                <TableCell className="min-w-28">
                  <SelectCell
                    line={row.line}
                    field="delivery_type"
                    value={
                      row.raw.delivery_type.trim().toUpperCase() || "STANDARD"
                    }
                    options={typeOptions}
                    onCellChange={onCellChange}
                  />
                </TableCell>
                <TableCell className="min-w-36">
                  <TextCell
                    line={row.line}
                    field="delivery_map_link"
                    value={row.raw.delivery_map_link}
                    onCellChange={onCellChange}
                    inputMode="url"
                  />
                </TableCell>
                <TableCell className="min-w-36">
                  <TextCell
                    line={row.line}
                    field="merchant_note"
                    value={row.raw.merchant_note}
                    onCellChange={onCellChange}
                  />
                </TableCell>
                <TableCell
                  className={
                    hasErrors
                      ? "text-destructive text-xs"
                      : "text-muted-foreground text-xs"
                  }
                >
                  {hasErrors ? rowErrors.join(" ") : "OK"}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
