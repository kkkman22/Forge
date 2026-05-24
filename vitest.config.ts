import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts", "packs/**/*.test.ts", "skills/**/*.test.ts"],
    setupFiles: ["./test/setup-fast-check.ts"],
    testTimeout: 5000,
    // forks pool isolates each test file in its own subprocess. If a worker
    // hangs (CPU-bound infinite loop, starved event loop), vitest can still
    // SIGKILL the fork — unlike `threads`, where a stuck worker can keep the
    // whole runner alive. See incident notes 2026-05-23 (orphan workers).
    pool: "forks",
    poolOptions: {
      forks: {
        maxForks: 2,
        // Belt-and-braces: explicit isolation so leaked timers/handles in
        // one test file cannot bleed into the next.
        isolate: true,
      },
    },
    fileParallelism: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text-summary"],
      thresholds: {
        lines: 88,
        functions: 90,
        branches: 85,
        statements: 88,
      },
    },
    benchmark: {
      include: ["test/benchmarks/**/*.bench.ts"],
      reporters: ["default"],
    },
  },
});
