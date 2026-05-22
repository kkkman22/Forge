import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "*.spec.ts",
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
  },
  webServer: {
    command: "E2E=true npm run build && E2E=true npm run preview",
    port: 4173,
    reuseExistingServer: true,
    timeout: 60000,
  },
});
