import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts", "packs/**/*.test.ts", "skills/**/*.test.ts"],
    testTimeout: 5000,
    pool: "threads",
    maxWorkers: 4,
    fileParallelism: true,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      reporter: ["text-summary"],
      thresholds: {
        lines: 87,
        functions: 90,
        branches: 79,
        statements: 87,
      },
    },
    benchmark: {
      include: ["test/benchmarks/**/*.bench.ts"],
      reporters: ["default"],
    },
  },
});
