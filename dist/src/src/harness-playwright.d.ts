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
}
export interface PlaywrightHarnessResult {
    ok: boolean;
    reason?: string;
    snapshot?: string;
    screenshotPath?: string;
}
export declare function runPlaywrightHarness(opts: PlaywrightHarnessOptions): Promise<PlaywrightHarnessResult>;
