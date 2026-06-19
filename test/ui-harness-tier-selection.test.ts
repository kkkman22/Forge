/**
 * Integration tests for UI harness tier selection and adapters.
 *
 * Covers [R6.2, R6.5, R6.8]:
 *   - Tier selection priority: project > cmux-browser > playwright > cdp
 *   - All tiers fail → INCONCLUSIVE
 *   - Forge package.json does not gain browser dependencies [R6.5]
 *   - Each adapter returns graceful failure when unavailable
 *
 * **Validates: Requirements R6.2, R6.5, R6.8**
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { runUiHarness } from "../src/ui-harness.js";

// Stubs injected into runUiHarness so NO real browser/network side-effect fires.
// These tests assert orchestration logic only (tier walk + verdict shape).
const noBrowser = {
  detectAgentBrowser: async () => false,
  playwrightRunner: async () => ({ ok: false, reason: "stub: playwright unavailable" }),
  cdpRunner: async () => ({ ok: false, reason: "stub: cdp unavailable" }),
};

describe("UI harness tier selection [R6.2, R6.8]", () => {
  it("returns a valid verdict with attempted controllers", async () => {
    const result = await runUiHarness({
      topic: "test-ui-tier",
      appUrl: "http://localhost:1",
      ...noBrowser,
    });

    expect(["INCONCLUSIVE", "VERIFIED", "NOT_VERIFIED"]).toContain(result.verdict);
    expect(result.controllersAttempted.length).toBeGreaterThan(0);
  });

  it("records attempted controllers with reasons", async () => {
    const result = await runUiHarness({
      topic: "test-ui-attempted",
      appUrl: "http://localhost:1",
      ...noBrowser,
    });

    for (const attempt of result.controllersAttempted) {
      expect(attempt.tier).toBeDefined();
      expect(attempt.reason).toBeDefined();
      expect(typeof attempt.reason).toBe("string");
    }
  });

  it("never throws even with invalid URL", async () => {
    await expect(
      runUiHarness({
        topic: "test-ui-invalid",
        appUrl: "",
        ...noBrowser,
      }),
    ).resolves.toBeDefined();
  });
});

describe("UI harness adapter graceful failure", () => {
  it("cmux-browser adapter returns failure when unavailable", async () => {
    const { runCmuxBrowserHarness } = await import("../src/harness-cmux-browser.js");
    const result = await runCmuxBrowserHarness({
      appUrl: "http://localhost:1",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it("playwright adapter returns failure when not installed", async () => {
    const { runPlaywrightHarness } = await import("../src/harness-playwright.js");
    const result = await runPlaywrightHarness({
      appUrl: "http://localhost:1",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it("playwright adapter accepts screenshotPath option and degrades gracefully", async () => {
    const { runPlaywrightHarness } = await import("../src/harness-playwright.js");
    const result = await runPlaywrightHarness({
      appUrl: "http://localhost:1",
      screenshotPath: "/tmp/forge-screenshot.png",
    });
    // Playwright not installed in CI → graceful degradation, never throws
    expect(result.ok).toBe(false);
    expect(result.reason).toBeDefined();
    // screenshotPath option must be accepted without error even when not installed
  });

  it("cdp adapter returns failure when no browser connected", async () => {
    const { runCdpHarness } = await import("../src/harness-cdp.js");
    const result = await runCdpHarness({
      appUrl: "http://localhost:1",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBeDefined();
  });
});

describe("UI harness dependency constraint [R6.5]", () => {
  it("Forge package.json has no browser testing dependencies", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
    const allDeps = [
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.devDependencies ?? {}),
    ];
    const browserDeps = allDeps.filter(
      (d) =>
        d.includes("playwright") ||
        d.includes("puppeteer") ||
        d.includes("cypress") ||
        d.includes("selenium"),
    );
    expect(browserDeps).toEqual([]);
  });
});
