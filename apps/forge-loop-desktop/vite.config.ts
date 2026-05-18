import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
  resolve: process.env.E2E
    ? {
        alias: {
          "@tauri-apps/api/core": path.resolve(__dirname, "e2e/fixtures.ts"),
          "@tauri-apps/api/event": path.resolve(__dirname, "e2e/fixtures.ts"),
          "@tauri-apps/plugin-dialog": path.resolve(__dirname, "e2e/fixtures.ts"),
        },
      }
    : undefined,
});
