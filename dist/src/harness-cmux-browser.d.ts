/**
 * cmux browser harness adapter — Tier 2 UI verification via cmux browser commands.
 *
 * Uses cmux CLI for structured a11y snapshots, screenshots, and console capture.
 * Returns graceful failure when cmux is not available.
 *
 * **Validates: Requirement R6.2, R6.4**
 */
export interface CmuxBrowserHarnessOptions {
    appUrl: string;
    designerSpecPath?: string;
}
export interface CmuxBrowserHarnessResult {
    ok: boolean;
    reason?: string;
    snapshot?: string;
    screenshotPath?: string;
    consoleLog?: string;
    errorsLog?: string;
}
export declare function runCmuxBrowserHarness(_opts: CmuxBrowserHarnessOptions): Promise<CmuxBrowserHarnessResult>;
