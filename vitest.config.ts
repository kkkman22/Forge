import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
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
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
    benchmark: {
      include: ["test/benchmarks/**/*.bench.ts"],
      reporters: ["default"],
    },
  },
});
