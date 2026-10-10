import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules/**", ".next/**", "e2e/**"],
    setupFiles: ["./test-setup.ts"],
    // Page-level component specs render a full dashboard (DataTable + cards) in
    // jsdom, and under full-suite load a single render can take tens of
    // seconds.
    //
    // Two separate concerns used to be conflated here:
    //
    //  1. An *isolation* bug — a timed-out render leaked into the next test's
    //     DOM and failed it with bogus "found multiple elements" errors. That
    //     is genuinely fixed, in `test-setup.ts`, which runs `cleanup()` and
    //     wipes `document.body` after every test. The timeout no longer masks
    //     anything.
    //  2. *Load*. This was briefly lowered to 30s while closing R1.6 and two
    //     specs failed at 34.8s and 37.2s — page-level renders really do
    //     exceed 30s on a loaded machine. So 60s stays as a load guard.
    //
    // Re-lower it only against a measured slow spec, never to close a bug.
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
    // Use worker threads instead of child processes. Threads share the same
    // V8 isolate, so startup is near-instant and coverage instrumentation
    // (which rewrites every module) does not pay a per-fork penalty. The
    // default `forks` pool timed out on 2-core CI runners under coverage.
    //
    // Cap at 4 workers so the machine is never saturated — on a 2-core
    // runner this means 2 workers (min(4, cores)); on a dev laptop with 16
    // cores it means 4, which is enough parallelism to finish the suite in
    // ~45s while leaving headroom for the OS and coverage I/O.
    pool: "threads",
    maxWorkers: 4,
    // Coverage tooling. `pnpm test:coverage` writes a summary +
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
        // Both entries need to be spelled out, and the nested one needs `/**`.
        // A bare `src/lib/db/schema*` reads like it covers the schema modules but
        // it is a sibling-only pattern: it matches `schema.ts` and nothing else,
        // and 0 of the 12 files in `schema.postgres/` slipped into the report.
        // That went unnoticed until @vitest/coverage-v8 5 began attributing the
        // arrow functions in those declarative table definitions, which pulled
        // `src/lib/**` function coverage from 88.78% down to 80% against an 85%
        // floor. Schema modules are declarations, not logic — there is nothing
        // to unit-test in them.
        "src/lib/db/schema.ts",
        "src/lib/db/schema.postgres/**",
        // Declarative fixture data, not logic. Counting ~60 untested seed files
        // in the denominator made the headline number incomparable and let a
        // real regression in src/lib hide behind the dilution.
        "src/lib/db/seed/**",
        "src/instrumentation*.ts",
      ],
      // Global floors, set under the measured baseline so a drop fails the gate
      // (measured 55.98 / 50.30 / 44.44 / 56.87 at the last raise). They are a
      // regression guard, not a target —
      // raise them as tests land; never lower them to make CI pass.
      //
      // The glob floors exist because a *global* number can be met while a
      // whole directory rots: `src/features/**` is deliberately not unit-tested
      // (feature hooks are covered through API specs and e2e), so it drags the
      // global figure down and would mask a real regression in src/lib.
      thresholds: {
        statements: 50,
        branches: 45,
        functions: 40,
        lines: 52,
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
        // The one directory that had no floor at all, so the
        // whole feature layer could lose ground while the global figure stayed
        // green. Set ~2 points under the measured baseline — statements 29.56,
        // branches 27.31, functions 23.64, lines 30.34 across 111 files.
        //
        // Deliberately modest: feature hooks are exercised through API specs
        // and e2e rather than unit tests, and 43 of those files have no unit
        // coverage by design. This is a floor against *losing* what the
        // component specs do cover, not a target for 100%.
        "src/features/**": {
          statements: 27,
          branches: 25,
          functions: 21,
          lines: 28,
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
