import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts", "packs/**/*.test.ts"],
    testTimeout: 5000,
    pool: "forks",
    poolOptions: {
      forks: {
        maxForks: 2,
      },
    },
    fileParallelism: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text-summary"],
      thresholds: {
        lines: 89.5,
        functions: 90,
        branches: 85,
        statements: 89.5,
      },
    },
    benchmark: {
      include: ["test/benchmarks/**/*.bench.ts"],
      reporters: ["default"],
    },
  },
});
