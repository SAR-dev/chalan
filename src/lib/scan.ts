/**
 * R9 decoder wrapper — the ONLY file in the codebase allowed to import
 * `qr-scanner` (grep-enforced by `scan.spec.ts`).
 *
 * Decoding only: this module does not know what an order is. Matching
 * (`decoded === order.id`) and manual entry live in the React gate
 * (`features/orders/components/scan-gate.tsx`).
 *
 * v1 interaction is one captured image, not a live stream: the gate hands us
 * an `<input type="file" capture="environment">` File and we decode it once.
 * There is no `<video>`, no `getUserMedia`, no stream to stop — the OS camera
 * app owns permissions, flash and autofocus.
 *
 * Client-only: the library is dynamically imported on first use so it never
 * reaches a server bundle. Swapping decoders later (or adding a streaming
 * mode) touches this file and no call site.
 */

export type ScanOutcome =
  | { kind: "code"; text: string } // decoded string; caller compares
  | { kind: "no-code" } // nothing readable in the photo

/**
 * Decode a QR code from a captured photo. Never throws: any failure —
 * no code in frame, unreadable photo, worker/CSP trouble — resolves to
 * `{ kind: "no-code" }` so the gate can offer a retry hint and keep manual
 * entry available rather than stranding the rider behind a spinner.
 */
export async function scanImage(file: File): Promise<ScanOutcome> {
  try {
    const { default: QrScanner } = await import("qr-scanner")
    const result = await QrScanner.scanImage(file, {
      returnDetailedScanResult: true,
    })
    return { kind: "code", text: result.data }
  } catch {
    return { kind: "no-code" }
  }
}
