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
    // Coverage tooling (ROADMAP P3). `pnpm test:coverage` writes a summary +
    // LCOV report; thresholds are enforced there and in CI so coverage cannot
    // silently regress.
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json-summary", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.spec.{ts,tsx}",
        "src/**/__tests__/**",
        "src/lib/db/schema*",
        // Declarative fixture data, not logic. Counting ~60 untested seed files
        // in the denominator made the headline number incomparable and let a
        // real regression in src/lib hide behind the dilution.
        "src/lib/db/seed/**",
        "src/instrumentation*.ts",
      ],
      // Global floors, set just under the measured baseline (statements 50.96,
      // branches 44.4, functions 39.15, lines 51.66) so a drop fails the gate.
      // They are a regression guard, not a target — raise them as tests land.
      //
      // The glob floors exist because a *global* number can be met while a
      // whole directory rots: `src/features/**` is deliberately not unit-tested
      // (feature hooks are covered through API specs and e2e), so it drags the
      // global figure down and would mask a real regression in src/lib.
      thresholds: {
        statements: 49,
        branches: 42,
        functions: 37,
        lines: 50,
        "src/lib/**": {
          statements: 80,
          branches: 74,
          functions: 85,
          lines: 80,
        },
        "src/app/api/**": {
          statements: 85,
          branches: 72,
          functions: 91,
          lines: 87,
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
})
