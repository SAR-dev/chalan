import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", "e2e/**"],
    setupFiles: ["./test-setup.ts"],
    // Page-level component specs render a full dashboard (DataTable + cards) in
    // jsdom. Under full-suite load (87 files transforming concurrently) a
    // single render can exceed 30s on a loaded machine — and when a test times
    // out its late render leaks into the next test's DOM, which then fails with
    // bogus "found multiple elements" errors. 60s keeps the suite honest.
    testTimeout: 60000,
    hookTimeout: 60000,
    // Isolation defaults (T9): without these, `vi.fn()` call history and
    // `vi.spyOn` patches leak between test files in the same worker, which is
    // what made merchant.spec.tsx / dashboard/riders intermittently fail in
    // full-suite runs while passing in isolation.
    //
    // NOTE: `unstubGlobals` is deliberately NOT enabled — several specs
    // (`forgot-password`, `reset-password`) call `vi.stubGlobal("fetch", ...)`
    // at module scope, and unstubbing before each test removes that stub.
    clearMocks: true,
    restoreMocks: true,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
})
