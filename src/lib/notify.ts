"use client"

/**
 * Notification wrapper — sonner toasts with sound.
 *
 * Drop-in replacement for `import { toast } from "sonner"`.
 * Every `toast.success` / `toast.error` call also plays a short sound cue
 * (howler.js, loaded once per page visit). All other sonner exports pass
 * through unchanged.
 *
 * howler.js auto-unlocks its Web Audio context on the first user gesture
 * (touchstart / click / keydown), so mobile Safari works out of the box.
 *
 * Usage:
 *   import { toast } from "@/lib/notify"   // ← swap the import, done
 *   toast.success("Saved.")                // shows toast + plays chime
 *   toast.error("Failed.")                 // shows toast + plays buzz
 *   toast.dismiss(id)                      // no sound, passthrough
 */

import { Howl } from "howler"
import { toast as sonner } from "sonner"

// ---------------------------------------------------------------------------
// Sound assets — tiny generated WAV chimes (~13 KB each).
// Loaded eagerly so the first toast has no delay.
// ---------------------------------------------------------------------------

const sounds = {
  success: new Howl({ src: ["/sounds/success.wav"], volume: 0.4 }),
  error: new Howl({ src: ["/sounds/error.wav"], volume: 0.4 }),
}

function play(kind: "success" | "error") {
  try {
    sounds[kind].play()
  } catch {
    // Swallow — sound is a nicety, never a blocker.
  }
}

// ---------------------------------------------------------------------------
// Wrapped toast
// ---------------------------------------------------------------------------

function successFn(
  ...args: Parameters<typeof sonner.success>
): ReturnType<typeof sonner.success> {
  play("success")
  return sonner.success(...args)
}

function errorFn(
  ...args: Parameters<typeof sonner.error>
): ReturnType<typeof sonner.error> {
  play("error")
  return sonner.error(...args)
}

// Build the wrapper: every sonner method passes through, success/error play
// sound first. Using Object.assign preserves the function identity so that
// `toast(message)` still works as a plain toast.
export const toast = Object.assign(
  (...args: Parameters<typeof sonner>) => sonner(...args),
  // Copy every static method from sonner so toast.dismiss, toast.custom,
  // toast.promise etc. remain available.
  ...Object.keys(sonner).map((key) => ({
    [key]: (sonner as unknown as Record<string, unknown>)[key],
  })),
  // Override the two we want sounds on.
  { success: successFn, error: errorFn },
) as typeof sonner
