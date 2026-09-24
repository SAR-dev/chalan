import "@testing-library/jest-dom/vitest"
import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

afterEach(() => {
  cleanup()
  // A test that times out is aborted mid-render, and React can still commit
  // that render afterwards. RTL's cleanup then runs before the late commit, so
  // the abandoned tree survives and the NEXT test sees duplicate elements.
  // Wiping the body guarantees isolation regardless of when the render landed.
  if (typeof document !== "undefined") {
    document.body.innerHTML = ""
  }
})

if (typeof ResizeObserver === "undefined") {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver =
    ResizeObserverMock as unknown as typeof ResizeObserver
}
