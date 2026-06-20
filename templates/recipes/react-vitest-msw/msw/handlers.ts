// MSW handler registry — the SINGLE source of request mocking.
// Consumed by both component tests (msw/server.ts → setupServer, Node) and
// your project's own Playwright E2E (msw/browser.ts → setupWorker, browser).
//
// Reuse boundaries (be honest, ADR-0006 Req6 AC8):
//   - Component tests (setupServer, Node http layer): ✅ handler takes effect directly.
//   - Your project's Playwright E2E (setupWorker, after registering mockServiceWorker.js
//     in your app HTML): ✅ handler takes effect.
//   - Forge's built-in agentBrowserRunner E2E: ❌ it drives a REAL dev server and
//     does NOT inject the MSW worker — it cannot reuse these handlers.
import { http, HttpResponse } from "msw";

export const handlers = [
  http.get("/api/user", () =>
    HttpResponse.json({ code: 1000, data: { role: "viewer" } }),
  ),
];
