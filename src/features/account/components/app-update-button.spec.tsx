// @vitest-environment jsdom

import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { AppUpdateButton } from "./app-update-button"

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }))

vi.mock("@/lib/notify", () => ({
  toast: { error: (m: string) => toastError(m) },
}))

/** The component ends in `location.reload()`, which jsdom does not implement. */
function stubReload() {
  const reload = vi.fn()
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, reload, href: "http://localhost/" },
  })
  return reload
}

interface FakeWorker {
  postMessage: ReturnType<typeof vi.fn>
}

function stubServiceWorker({
  registration,
  caches = new Set<string>(),
}: {
  registration: unknown
  caches?: Set<string>
}) {
  const added = vi.fn()
  const deleted = vi.fn()
  const listeners: Record<string, (() => void)[]> = {}

  Object.defineProperty(window, "caches", {
    configurable: true,
    value: {
      keys: async () => [...caches],
      delete: (key: string) => {
        deleted(key)
        caches.delete(key)
        return Promise.resolve(true)
      },
      add: (...args: unknown[]) => {
        added(...args)
        return Promise.resolve()
      },
    },
  })

  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: {
      getRegistration: async () => registration,
      addEventListener: (type: string, fn: () => void) => {
        listeners[type] ??= []
        listeners[type].push(fn)
      },
      // Lets a test stand in for the worker taking control.
      emit: (type: string) => {
        for (const fn of listeners[type] ?? []) fn()
      },
    },
  })

  return {
    added,
    deleted,
    emit: (type: string) => {
      for (const fn of listeners[type] ?? []) fn()
    },
    listenerCount: (type: string) => (listeners[type] ?? []).length,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  Reflect.deleteProperty(navigator, "serviceWorker")
  Reflect.deleteProperty(window, "caches")
})

describe("AppUpdateButton", () => {
  it("asks the worker to purge, re-checks it, and reloads", async () => {
    const reload = stubReload()
    const worker: FakeWorker = { postMessage: vi.fn() }
    const update = vi.fn(async () => undefined)
    const sw = stubServiceWorker({ registration: { active: worker, update } })

    render(<AppUpdateButton />)
    await userEvent.click(screen.getByTestId("account-build-update"))

    // The worker claims control as soon as the new one installs — that is the
    // path taken on a real redeploy, and it must not wait out the timeout.
    await waitFor(() =>
      expect(sw.listenerCount("controllerchange")).toBeGreaterThan(0),
    )
    sw.emit("controllerchange")

    await waitFor(() => expect(reload).toHaveBeenCalled())
    expect(worker.postMessage).toHaveBeenCalledWith({ type: "PURGE_CACHES" })
    expect(update).toHaveBeenCalled()
    // Reached through the worker, so the page itself must not also be deleting.
    expect(sw.deleted).not.toHaveBeenCalled()
  })

  it("prefers a waiting worker over the active one", async () => {
    stubReload()
    const active: FakeWorker = { postMessage: vi.fn() }
    const waiting: FakeWorker = { postMessage: vi.fn() }
    stubServiceWorker({
      registration: { active, waiting, update: vi.fn(async () => undefined) },
    })

    render(<AppUpdateButton />)
    await userEvent.click(screen.getByTestId("account-build-update"))

    await waitFor(() => expect(waiting.postMessage).toHaveBeenCalled())
    expect(active.postMessage).not.toHaveBeenCalled()
  })

  it("deletes caches directly when no worker is registered", async () => {
    const reload = stubReload()
    const sw = stubServiceWorker({
      registration: undefined,
      caches: new Set(["chalan-shell-0.1.0", "chalan-static-0.1.0"]),
    })

    render(<AppUpdateButton />)
    await userEvent.click(screen.getByTestId("account-build-update"))

    await waitFor(() => expect(reload).toHaveBeenCalled())
    expect(sw.deleted).toHaveBeenCalledWith("chalan-shell-0.1.0")
    expect(sw.deleted).toHaveBeenCalledWith("chalan-static-0.1.0")
  })

  it("reloads even when no worker ever claims control", async () => {
    // The timeout is the backstop: a worker that never claims must not leave
    // the user staring at a spinning button.
    const reload = stubReload()
    stubServiceWorker({
      registration: { active: null, update: vi.fn(async () => undefined) },
    })

    render(<AppUpdateButton />)
    await userEvent.click(screen.getByTestId("account-build-update"))

    await waitFor(() => expect(reload).toHaveBeenCalled(), { timeout: 4000 })
  })

  it("reloads rather than stranding the user when purging throws", async () => {
    const reload = stubReload()
    stubServiceWorker({
      registration: {
        active: null,
        update: async () => {
          throw new Error("offline")
        },
      },
    })

    render(<AppUpdateButton />)
    await userEvent.click(screen.getByTestId("account-build-update"))

    await waitFor(() => expect(reload).toHaveBeenCalled())
    expect(toastError).toHaveBeenCalled()
  })

  it("cannot be pressed twice while a refresh is in flight", async () => {
    stubReload()
    stubServiceWorker({
      registration: { active: null, update: vi.fn(async () => undefined) },
    })

    render(<AppUpdateButton />)
    const button = screen.getByTestId("account-build-update")
    await userEvent.click(button)

    await waitFor(() => expect(button).toBeDisabled())
    expect(button).toHaveTextContent("Refreshing…")
  })
})
