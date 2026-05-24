import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts", "packs/**/*.test.ts", "skills/**/*.test.ts"],
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
