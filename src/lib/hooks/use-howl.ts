"use client"

import { Howl } from "howler"
import { useEffect, useRef } from "react"

/**
 * Thin howler.js wrapper for short notification sounds.
 *
 * Loads the sound once, plays on demand, and unloads on unmount.
 * Returns a stable `play` function that is safe to call from event handlers.
 *
 * howler.js auto-unlocks its Web Audio context on the first user gesture
 * (touchstart / click / keydown), so mobile Safari works out of the box.
 *
 * @param src - One or more URLs (wav/mp3/ogg). Provide multiple formats for
 *   cross-browser coverage; howler picks the first playable one.
 */
export function useHowl(src: string | string[]) {
  const ref = useRef<Howl | null>(null)

  useEffect(() => {
    const howl = new Howl({
      src: Array.isArray(src) ? src : [src],
      preload: true,
      volume: 0.5,
    })
    ref.current = howl

    return () => {
      howl.unload()
      ref.current = null
    }
  }, [src])

  return () => {
    ref.current?.play()
  }
}
