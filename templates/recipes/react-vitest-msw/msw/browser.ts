// setupWorker — for YOUR project's Playwright/browser E2E.
// Register mockServiceWorker.js in your app HTML first (see MSW docs), then
// import this so the worker uses the same handler registry.
//
// NOTE: Forge's built-in agentBrowserRunner does NOT consume this worker —
// it drives a real dev server. This worker is for YOUR Playwright setup only.
import { setupWorker } from "msw/browser";
import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);
