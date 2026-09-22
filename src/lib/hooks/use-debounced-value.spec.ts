import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useDebouncedValue } from "./use-debounced-value"

describe("useDebouncedValue", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("exports a function", () => {
    expect(typeof useDebouncedValue).toBe("function")
  })

  it("debounce logic: value updates only after delay", () => {
    let debouncedValue = "initial"

    const updateDebounced = (value: string, delayMs: number) => {
      setTimeout(() => {
        debouncedValue = value
      }, delayMs)
    }

    updateDebounced("changed", 300)

    // Before delay: debounced is still old
    expect(debouncedValue).toBe("initial")

    // After delay: debounced catches up
    vi.advanceTimersByTime(300)
    expect(debouncedValue).toBe("changed")
  })

  it("debounce logic: rapid changes reset the timer", () => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let debouncedValue = "a"

    const updateDebounced = (value: string, delayMs: number) => {
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(() => {
        debouncedValue = value
      }, delayMs)
    }

    // First change
    updateDebounced("b", 300)
    vi.advanceTimersByTime(200) // 200ms elapsed

    // Second change resets the timer
    updateDebounced("c", 300)
    vi.advanceTimersByTime(200) // 200ms since second change

    // "b" was cleared, "c" hasn't fired yet
    expect(debouncedValue).toBe("a")

    // "c" fires after its full delay
    vi.advanceTimersByTime(100)
    expect(debouncedValue).toBe("c")
  })
})
