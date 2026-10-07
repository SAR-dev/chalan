"use client"

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  LABEL_BLOCK_WIDTHS,
  LABEL_FIELD_KEYS,
  LABEL_FIELD_LABELS,
  LABEL_FONT_SCALES,
  LABEL_ICON_DEFAULT_MM,
  LABEL_ICON_MIN_MM,
  LABEL_MAX_BLOCKS,
  LABEL_QR_MIN_MM,
  LABEL_SPACER_MAX_MM,
  LABEL_TEMPLATE_MAX_MM,
  LABEL_TEXT_DEFAULT,
  LABEL_TEXT_MAX,
  type LabelBlockWidth,
} from "@/lib/constants"
import type { LabelBlock } from "@/lib/validation"

// =============================================================================
// Label block editor (R5)
//
// The admin-facing half of the designer: add, remove, reorder and configure the
// typed blocks the renderer lays out. Every control is an enum drawn from
// `src/lib/constants.ts` or a clamped number, so the editor cannot produce a
// block the renderer does not understand or a QR a scanner cannot read.
// =============================================================================

type BlockType = LabelBlock["type"]

const BLOCK_LABELS: Record<BlockType, string> = {
  logo: "Logo",
  qr: "QR code",
  field: "Field",
  text: "Custom text",
  icon: "Brand icon",
  separator: "Separator",
  spacer: "Spacer",
}

/** The order the "Add block" buttons appear in — most common first. */
const ADD_ORDER: BlockType[] = [
  "field",
  "text",
  "qr",
  "icon",
  "logo",
  "separator",
  "spacer",
]

function newBlock(type: BlockType): LabelBlock {
  switch (type) {
    case "logo":
      return { type: "logo", width: "full" }
    case "qr":
      return { type: "qr", minSizeMm: LABEL_QR_MIN_MM, caption: true }
    case "field":
      return {
        type: "field",
        field: "recipientName",
        scale: "m",
        bold: false,
        width: "full",
      }
    case "text":
      return {
        type: "text",
        text: LABEL_TEXT_DEFAULT,
        scale: "m",
        bold: false,
        width: "full",
      }
    case "icon":
      return {
        type: "icon",
        heightMm: LABEL_ICON_DEFAULT_MM,
        width: "full",
      }
    case "separator":
      return { type: "separator" }
    case "spacer":
      return { type: "spacer", heightMm: 4 }
  }
}

function clampNumber(
  raw: string,
  min: number,
  max: number,
  fallback: number,
): number {
  const value = Number(raw)
  if (Number.isNaN(value)) return fallback
  return Math.min(Math.max(value, min), max)
}

export interface LabelBlockEditorProps {
  blocks: LabelBlock[]
  onChange: (blocks: LabelBlock[]) => void
}

export function LabelBlockEditor({ blocks, onChange }: LabelBlockEditorProps) {
  function update(index: number, next: LabelBlock) {
    onChange(blocks.map((block, i) => (i === index ? next : block)))
  }

  function remove(index: number) {
    onChange(blocks.filter((_, i) => i !== index))
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= blocks.length) return
    const next = [...blocks]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    onChange(next)
  }

  const atMax = blocks.length >= LABEL_MAX_BLOCKS

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3" data-testid="label-block-list">
        {blocks.length === 0 && (
          <p className="text-muted-foreground text-sm">
            No blocks yet. Add one below.
          </p>
        )}
        {blocks.map((block, index) => (
          <div
            // Index is part of the key on purpose: two identical spacer blocks
            // are legal, so the key cannot be the block alone.
            key={`${block.type}-${index}`}
            data-testid={`label-block-row-${index}`}
            className="bg-card flex flex-col gap-3 rounded-lg border p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium">
                {index + 1}. {blockTypeLabel(block)}
              </span>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Move block up"
                  data-testid={`label-block-up-${index}`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Move block down"
                  data-testid={`label-block-down-${index}`}
                  disabled={index === blocks.length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown className="size-3.5" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="text-destructive"
                  aria-label="Remove block"
                  data-testid={`label-block-remove-${index}`}
                  onClick={() => remove(index)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>

            <BlockControls
              block={block}
              index={index}
              onUpdate={(next) => update(index, next)}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs">Add block:</span>
        {ADD_ORDER.map((type) => (
          <Button
            key={type}
            type="button"
            variant="outline"
            size="sm"
            data-testid={`label-add-${type}`}
            disabled={atMax}
            onClick={() => onChange([...blocks, newBlock(type)])}
          >
            <Plus className="size-3.5" />
            {BLOCK_LABELS[type]}
          </Button>
        ))}
      </div>
    </div>
  )
}

function blockTypeLabel(block: LabelBlock): string {
  if (block.type === "field")
    return `Field · ${LABEL_FIELD_LABELS[block.field]}`
  if (block.type === "text") return `Custom text · ${labelSnippet(block.text)}`
  return BLOCK_LABELS[block.type]
}

/** One-line preview of a custom-text block, quoted and clipped for the header. */
function labelSnippet(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length === 0) return "“”"
  return `“${trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed}”`
}

function BlockControls({
  block,
  index,
  onUpdate,
}: {
  block: LabelBlock
  index: number
  onUpdate: (block: LabelBlock) => void
}) {
  switch (block.type) {
    case "logo":
      return (
        <div className="flex items-center justify-between gap-2">
          <Label>Width</Label>
          <WidthSelect
            testId={`label-block-width-${index}`}
            value={block.width}
            onChange={(width) => onUpdate({ ...block, width })}
          />
        </div>
      )

    case "qr":
      return (
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`block-qr-size-${index}`}>
            Size (mm, min {LABEL_QR_MIN_MM})
          </Label>
          <Input
            id={`block-qr-size-${index}`}
            type="number"
            min={LABEL_QR_MIN_MM}
            max={LABEL_TEMPLATE_MAX_MM}
            value={block.minSizeMm}
            data-testid={`label-qr-size-${index}`}
            className="w-24"
            onChange={(e) =>
              onUpdate({
                ...block,
                minSizeMm: clampNumber(
                  e.target.value,
                  LABEL_QR_MIN_MM,
                  LABEL_TEMPLATE_MAX_MM,
                  block.minSizeMm,
                ),
              })
            }
          />
        </div>
      )

    case "field":
      return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`block-field-${index}`}>Field</Label>
            <Select
              value={block.field}
              onValueChange={(v) =>
                onUpdate({ ...block, field: v ?? block.field })
              }
            >
              <SelectTrigger
                id={`block-field-${index}`}
                className="w-full"
                data-testid={`label-field-select-${index}`}
              >
                <SelectValue>
                  {(value) =>
                    LABEL_FIELD_LABELS[
                      value as keyof typeof LABEL_FIELD_LABELS
                    ] ?? "Field"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {LABEL_FIELD_KEYS.map((key) => (
                  <SelectItem key={key} value={key}>
                    {LABEL_FIELD_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`block-scale-${index}`}>Size</Label>
            <Select
              value={block.scale}
              onValueChange={(v) =>
                onUpdate({ ...block, scale: v ?? block.scale })
              }
            >
              <SelectTrigger
                id={`block-scale-${index}`}
                className="w-full"
                data-testid={`label-scale-select-${index}`}
              >
                <SelectValue>
                  {(value) => String(value ?? block.scale).toUpperCase()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {LABEL_FONT_SCALES.map((scale) => (
                  <SelectItem key={scale} value={scale}>
                    {scale.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`block-bold-${index}`}>Bold</Label>
            <Switch
              id={`block-bold-${index}`}
              data-testid={`label-bold-${index}`}
              checked={block.bold}
              onCheckedChange={(checked) =>
                onUpdate({ ...block, bold: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`block-width-${index}`}>Width</Label>
            <WidthSelect
              id={`block-width-${index}`}
              testId={`label-width-select-${index}`}
              value={block.width}
              onChange={(width) => onUpdate({ ...block, width })}
            />
          </div>
        </div>
      )

    case "text":
      return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor={`block-text-${index}`}>Custom text</Label>
            <Textarea
              id={`block-text-${index}`}
              value={block.text}
              maxLength={LABEL_TEXT_MAX}
              rows={2}
              data-testid={`label-text-${index}`}
              onChange={(e) => onUpdate({ ...block, text: e.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`block-text-scale-${index}`}>Size</Label>
            <Select
              value={block.scale}
              onValueChange={(v) =>
                onUpdate({ ...block, scale: v ?? block.scale })
              }
            >
              <SelectTrigger
                id={`block-text-scale-${index}`}
                className="w-full"
                data-testid={`label-text-scale-${index}`}
              >
                <SelectValue>
                  {(value) => String(value ?? block.scale).toUpperCase()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {LABEL_FONT_SCALES.map((scale) => (
                  <SelectItem key={scale} value={scale}>
                    {scale.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`block-text-bold-${index}`}>Bold</Label>
            <Switch
              id={`block-text-bold-${index}`}
              data-testid={`label-text-bold-${index}`}
              checked={block.bold}
              onCheckedChange={(checked) =>
                onUpdate({ ...block, bold: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`block-text-width-${index}`}>Width</Label>
            <WidthSelect
              id={`block-text-width-${index}`}
              testId={`label-text-width-${index}`}
              value={block.width}
              onChange={(width) => onUpdate({ ...block, width })}
            />
          </div>
        </div>
      )

    case "icon":
      return (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`block-icon-height-${index}`}>
              Height (mm, min {LABEL_ICON_MIN_MM})
            </Label>
            <Input
              id={`block-icon-height-${index}`}
              type="number"
              min={LABEL_ICON_MIN_MM}
              max={LABEL_SPACER_MAX_MM}
              value={block.heightMm}
              className="w-24"
              data-testid={`label-icon-height-${index}`}
              onChange={(e) =>
                onUpdate({
                  ...block,
                  heightMm: clampNumber(
                    e.target.value,
                    LABEL_ICON_MIN_MM,
                    LABEL_SPACER_MAX_MM,
                    block.heightMm,
                  ),
                })
              }
            />
          </div>

          <div className="flex items-center justify-between gap-2">
            <Label htmlFor={`block-icon-width-${index}`}>Width</Label>
            <WidthSelect
              id={`block-icon-width-${index}`}
              testId={`label-icon-width-${index}`}
              value={block.width}
              onChange={(width) => onUpdate({ ...block, width })}
            />
          </div>
        </div>
      )

    case "spacer":
      return (
        <div className="flex items-center justify-between gap-2">
          <Label htmlFor={`block-spacer-${index}`}>Height (mm)</Label>
          <Input
            id={`block-spacer-${index}`}
            type="number"
            min={1}
            max={LABEL_SPACER_MAX_MM}
            value={block.heightMm}
            className="w-24"
            data-testid={`label-spacer-height-${index}`}
            onChange={(e) =>
              onUpdate({
                ...block,
                heightMm: clampNumber(
                  e.target.value,
                  1,
                  LABEL_SPACER_MAX_MM,
                  block.heightMm,
                ),
              })
            }
          />
        </div>
      )

    case "separator":
      return null
  }
}

function WidthSelect({
  value,
  onChange,
  id,
  testId,
}: {
  value: LabelBlockWidth
  onChange: (width: LabelBlockWidth) => void
  id?: string
  testId?: string
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v === "full" || v === "half") onChange(v)
      }}
    >
      <SelectTrigger id={id} className="w-28" data-testid={testId}>
        <SelectValue>
          {(value) => (value === "half" ? "Half" : "Full")}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {LABEL_BLOCK_WIDTHS.map((width) => (
          <SelectItem key={width} value={width}>
            {width === "half" ? "Half" : "Full"}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
