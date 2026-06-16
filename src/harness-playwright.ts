/**
 * Playwright harness adapter — Tier 3 UI verification.
 *
 * Uses Playwright only if installed in user's project devDependencies [R6.5].
 * Forge MUST NOT add Playwright to its own package.json.
 *
 * **Validates: Requirement R6.2, R6.5**
 */

export interface PlaywrightHarnessOptions {
  appUrl: string;
  designerSpecPath?: string;
  /**
   * Optional path to write a full-page screenshot after navigation.
   * When provided and Playwright is available, a PNG is written here and
   * the absolute path is echoed back in the result. Used by adversarial-check
   * behavioral verification (loop-engineering-adoption R1) to capture
   * confidence:100 mechanical evidence.
   */
  screenshotPath?: string;
}

export interface PlaywrightHarnessResult {
  ok: boolean;
  reason?: string;
  snapshot?: string;
  screenshotPath?: string;
}

export async function runPlaywrightHarness(
  opts: PlaywrightHarnessOptions,
): Promise<PlaywrightHarnessResult> {
  try {
    // Guarded import — only works if user has Playwright installed [R6.5]
    // biome-ignore lint/suspicious/noExplicitAny: playwright is an optional peer with unknown shape at build time
    let pw: any = null;
    try {
      // @ts-expect-error — playwright is an optional peer; not installed in Forge itself [R6.5]
      pw = await import("playwright");
    } catch (_err: unknown) {
      return { ok: false, reason: "Playwright not installed in user project" };
    }

    if (!pw) {
      return { ok: false, reason: "Playwright import returned null" };
    }

    const browser = await pw.chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(opts.appUrl, { waitUntil: "networkidle", timeout: 10000 });
      const snapshot = await page.accessibility.snapshot();

      // Behavioral verification: capture a screenshot when a path is requested.
      // This is the mechanical-evidence capture used by adversarial-check (R1).
      let screenshotPath: string | undefined;
      if (opts.screenshotPath) {
        await page.screenshot({ path: opts.screenshotPath, fullPage: true });
        screenshotPath = opts.screenshotPath;
      }

      return {
        ok: true,
        snapshot: JSON.stringify(snapshot, null, 2),
        screenshotPath,
      };
    } finally {
      await browser.close();
    }
  } catch (error) {
    return {
      ok: false,
      reason: `Playwright harness error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
