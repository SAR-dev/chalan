"use client"

import { Camera, CheckCircle2, Loader2 } from "lucide-react"
import { useId, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { scanImage } from "@/lib/scan"

/**
 * R9 scan gate — verify the parcel label before the possession changes.
 *
 * Rendered at the top of the pickup / delivery dialog body when the relevant
 * platform toggle is on ("off means absent" — the dialog renders nothing of
 * this). The gate is an accelerator, never a gate on the API: the transition
 * body is identical either way, and manual code entry is always available so
 * no photo path can strand the rider.
 *
 * v1 interaction is one captured photo: a hidden
 * `<input type="file" accept="image/*" capture="environment">` behind the
 * "Scan label" button opens the OS camera app, and the returned File is
 * decoded once (`src/lib/scan.ts`). No `<video>`, no `getUserMedia` — the OS
 * owns permissions, flash and autofocus.
 *
 * States: idle → decoding → verified | mismatch, plus `unreadable` (decode
 * failure → retry hint, never a spinner that outlives the attempt).
 * Verification itself is owned by the dialog, which resets it with its
 * existing patterns (pickup: order change; delivery: close).
 */

type Phase = "idle" | "decoding" | "mismatch" | "unreadable"

/** Mismatch shows arbitrary decoded strings (URLs, other labels) as-is. */
const MAX_CODE_LENGTH = 48

function truncate(text: string): string {
  return text.length > MAX_CODE_LENGTH
    ? `${text.slice(0, MAX_CODE_LENGTH - 1)}…`
    : text
}

function normalize(code: string): string {
  return code.trim().toUpperCase()
}

export function ScanGate({
  orderId,
  verified,
  onVerify,
}: {
  orderId: string
  verified: boolean
  onVerify: () => void
}) {
  const inputId = useId()
  const fileRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>("idle")
  const [readCode, setReadCode] = useState<string | null>(null)
  const [manual, setManual] = useState("")

  const manualMatches = normalize(manual) === normalize(orderId)
  // Stay quiet while the rider is still typing a prefix of the code.
  const manualLongEnough = manual.trim().length >= orderId.length
  const decoding = phase === "decoding"

  function verify() {
    // Leave the gate pristine: if the dialog resets `verified` and this
    // component stays mounted, it must not come back pre-filled / pre-matched.
    setPhase("idle")
    setReadCode(null)
    setManual("")
    onVerify()
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Clear before decoding so the same photo can be re-picked after a miss.
    e.target.value = ""
    if (!file) return
    setPhase("decoding")
    setReadCode(null)
    try {
      const outcome = await scanImage(file)
      if (outcome.kind !== "code") {
        setPhase("unreadable")
        return
      }
      if (outcome.text === orderId) {
        verify()
        return
      }
      setReadCode(outcome.text)
      setPhase("mismatch")
    } catch {
      // scanImage never rejects today; guard anyway so no photo path can
      // strand the rider on an eternal "decoding".
      setPhase("unreadable")
    }
  }

  function handleManualChange(value: string) {
    setManual(value)
    if (normalize(value) === normalize(orderId)) verify()
  }

  return (
    <div
      data-testid="scan-gate"
      className="border-border flex flex-col gap-3 rounded-lg border p-3"
    >
      {verified ? (
        <div
          className="flex items-center gap-2 text-sm"
          data-testid="scan-gate-verified"
        >
          <CheckCircle2 className="text-chart-2 size-4 shrink-0" />
          <span>
            Label verified <span className="font-mono">{orderId}</span>
          </span>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-0.5">
              <p className="text-sm font-medium">Scan the parcel label</p>
              <p className="text-muted-foreground text-sm">
                Photo the QR code on the label, or type the code below.
              </p>
            </div>
            {/* Full-width on a phone: this opens the camera, and it is the
                rider's critical path at a doorstep. */}
            <Button
              type="button"
              variant="outline"
              size="default"
              className="w-full shrink-0 sm:w-auto"
              data-testid="scan-gate-scan"
              disabled={decoding}
              onClick={() => fileRef.current?.click()}
            >
              {decoding ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Camera className="size-4" />
              )}
              {decoding ? "Reading photo…" : "Scan label"}
            </Button>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            tabIndex={-1}
            data-testid="scan-gate-file-input"
            onChange={handleFileChange}
          />

          {phase === "mismatch" && readCode !== null ? (
            <p
              className="text-destructive text-sm"
              data-testid="scan-gate-mismatch"
            >
              Read {truncate(readCode)} — this parcel is {orderId}
            </p>
          ) : null}

          {phase === "unreadable" ? (
            <p
              className="text-muted-foreground text-sm"
              data-testid="scan-gate-unreadable"
            >
              Couldn&apos;t read a QR code in that photo. Try again, or type the
              code below.
            </p>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={inputId} className="text-sm">
              Code from the label
            </Label>
            <Input
              id={inputId}
              data-testid="scan-gate-manual"
              value={manual}
              onChange={(e) => handleManualChange(e.target.value)}
              placeholder="ORD-000000"
              autoComplete="off"
              spellCheck={false}
            />
            {manualLongEnough && !manualMatches ? (
              <p
                className="text-muted-foreground text-sm"
                data-testid="scan-gate-manual-mismatch"
              >
                Doesn&apos;t match this order&apos;s code.
              </p>
            ) : null}
          </div>
        </>
      )}
    </div>
  )
}
