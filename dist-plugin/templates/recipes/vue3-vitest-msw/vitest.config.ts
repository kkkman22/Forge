import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import path from "node:path";

// vitest config for component-layer tests (ADR-0006 Layer 3).
// jsdom environment + MSW setup. Adjust alias to match your project's @ alias.
export default defineConfig({
  plugins: [vue()],
  test: {
    environment: "jsdom",
    setupFiles: ["./test/setup.ts"],
    include: ["test/component/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
