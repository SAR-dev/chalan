// @vitest-environment node
import { readFileSync } from "node:fs"
import { join } from "node:path"
import vm from "node:vm"
import { describe, expect, it } from "vitest"

// `public/sw.js` is a security boundary, not a build artefact: it decides what
// HTML survives on a shared device. It is plain JS outside the
// src/ tree, so nothing else in the suite ever executes it — this loads the
// real file in a sandbox and drives its listeners directly.
//
// The defect it guards against had two paths, and both are asserted here:
// a navigation response written under the `"/"` key, and `cache.addAll(["/"])`
// at install following `/`, which always redirects
// (src/app/page.tsx: authenticated → their portal, else → /landing).

interface FakeResponse {
  ok: boolean
  redirected: boolean
  headers: { get(name: string): string | null }
  clone(): FakeResponse
  text(): Promise<string>
  url: string
}

function makeResponse(
  body: string,
  opts: {
    ok?: boolean
    redirected?: boolean
    cacheControl?: string
    url?: string
  } = {},
): FakeResponse {
  const response: FakeResponse = {
    ok: opts.ok ?? true,
    redirected: opts.redirected ?? false,
    headers: {
      get(name: string) {
        return name === "Cache-Control" ? (opts.cacheControl ?? null) : null
      },
    },
    clone: () => makeResponse(body, opts),
    text: () => Promise.resolve(body),
    url: opts.url ?? "http://localhost:3000/landing",
  }
  return response
}

interface ServiceWorkerHarness {
  /** The shell cache, keyed by path — the real Cache API's model. */
  stored: Map<string, FakeResponse>
  /** Paths passed to `cache.addAll` during install. */
  precached: string[]
  dispatch(type: "install" | "activate"): Promise<unknown>
  navigate(
    path: string,
    response: FakeResponse | Error,
  ): Promise<FakeResponse | undefined>
}

function loadServiceWorker(): ServiceWorkerHarness {
  const source = readFileSync(join(process.cwd(), "public", "sw.js"), "utf-8")
  const listeners = new Map<string, (event: unknown) => void>()
  const stored = new Map<string, FakeResponse>()
  const precached: string[] = []
  // Held outside the sandbox so `navigate` can swap it after the script has
  // been evaluated; the worker resolves `fetch` off the global each call.
  let fetchImpl: (request?: unknown) => Promise<FakeResponse> = () =>
    Promise.reject(new Error("no fetch configured"))

  const shellCache = {
    addAll: (urls: string[]) => {
      precached.push(...urls)
      return Promise.resolve()
    },
    put: (key: unknown, response: FakeResponse) => {
      stored.set(String(key), response)
      return Promise.resolve()
    },
  }

  const sandbox = {
    self: {
      addEventListener: (type: string, fn: (event: unknown) => void) => {
        listeners.set(type, fn)
      },
      location: new URL("http://localhost:3000/sw.js"),
      skipWaiting: () => Promise.resolve(),
      clients: { claim: () => Promise.resolve() },
    },
    caches: {
      open: () => Promise.resolve(shellCache),
      match: (key: unknown) => Promise.resolve(stored.get(String(key))),
      keys: () => Promise.resolve([]),
      delete: () => Promise.resolve(true),
    },
    fetch: (request: unknown) => fetchImpl(request),
    URL,
    console,
  }

  vm.runInContext(source, vm.createContext(sandbox))

  return {
    stored,
    precached,
    dispatch(type) {
      let result: Promise<unknown> | undefined
      listeners.get(type)?.({
        waitUntil: (promise: Promise<unknown>) => {
          result = promise
        },
      })
      return result ?? Promise.resolve()
    },
    async navigate(path, response) {
      fetchImpl = () =>
        response instanceof Error
          ? Promise.reject(response)
          : Promise.resolve(response)

      let handled: Promise<FakeResponse> | undefined
      listeners.get("fetch")?.({
        request: {
          url: `http://localhost:3000${path}`,
          method: "GET",
          mode: "navigate",
        },
        respondWith: (promise: Promise<FakeResponse>) => {
          handled = promise
        },
      })
      // Not intercepted at all — the worker passed it through.
      if (!handled) return undefined
      const final = await handled
      // Let any `cache.put` queued by the handler settle first.
      await new Promise((resolve) => setTimeout(resolve, 0))
      return final
    },
  }
}

async function bodyOf(response: FakeResponse | undefined): Promise<unknown> {
  return response ? response.text() : undefined
}

const PORTAL_HTML = "<html>Merchant 1 Business · COD 42,000 TK</html>"
const PUBLIC_HTML = "<html>Sign in to access your workspace.</html>"

describe("public/sw.js", () => {
  it("precaches the public landing page, never the redirecting /", async () => {
    const sw = loadServiceWorker()
    await sw.dispatch("install")
    expect(sw.precached).toContain("/landing")
    // `/` always redirects (src/app/page.tsx), so precaching it stores
    // whichever user installs the worker's document under that key.
    expect(sw.precached).not.toContain("/")
  })

  it("never writes an authenticated navigation to the cache", async () => {
    const sw = loadServiceWorker()
    await sw.navigate("/dashboard", makeResponse(PORTAL_HTML))
    expect(sw.stored.size).toBe(0)
    expect(sw.stored.has("/")).toBe(false)
    expect(sw.stored.has("/dashboard")).toBe(false)
  })

  it("stores a public page under its own path, not under /", async () => {
    const sw = loadServiceWorker()
    await sw.navigate("/login", makeResponse(PUBLIC_HTML))
    expect(await bodyOf(sw.stored.get("/login"))).toBe(PUBLIC_HTML)
    expect(sw.stored.has("/")).toBe(false)
  })

  it("refuses a response the origin marked private or no-store", async () => {
    for (const cacheControl of ["private, max-age=0", "no-store"]) {
      const sw = loadServiceWorker()
      await sw.navigate("/login", makeResponse(PUBLIC_HTML, { cacheControl }))
      expect(sw.stored.size, `Cache-Control: ${cacheControl}`).toBe(0)
    }
  })

  it("refuses a redirected response, whose key would not match its content", async () => {
    const sw = loadServiceWorker()
    await sw.navigate("/login", makeResponse(PORTAL_HTML, { redirected: true }))
    expect(sw.stored.size).toBe(0)
  })

  it("refuses sub-routes that render specific records", async () => {
    const sw = loadServiceWorker()
    await sw.navigate(
      "/track/ORD-100001E",
      makeResponse("<html>order contents</html>"),
    )
    expect(sw.stored.size).toBe(0)
  })

  // The whole point: offline, an uncached (i.e. authenticated) path must not
  // surface a stale portal — it lands on the public shell.
  it("falls back to the public shell when offline on an uncached path", async () => {
    const sw = loadServiceWorker()
    sw.stored.set("/landing", makeResponse(PUBLIC_HTML))
    const served = await sw.navigate("/dashboard", new Error("offline"))
    expect(await bodyOf(served)).toBe(PUBLIC_HTML)
  })

  it("serves the matching cached page when offline on a public path", async () => {
    const sw = loadServiceWorker()
    sw.stored.set("/login", makeResponse(PUBLIC_HTML))
    const served = await sw.navigate("/login", new Error("offline"))
    expect(await bodyOf(served)).toBe(PUBLIC_HTML)
  })
})
