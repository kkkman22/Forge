/**
 * Harness detector — shared tier detection for CLI and UI harnesses.
 *
 * Provides 4-level priority detection:
 *   1. Project's own harness (test/e2e/*.spec.ts, playwright.config, etc.)
 *   2. cmux ($CMUX_WORKSPACE_ID + socket)
 *   3. tmux (command -v tmux)
 *   4. Node PTY fallback
 *
 * **Validates: Requirements R5.2, R6.2, R14.3, R14.4**
 */
/**
 * Detect if cmux is available via workspace ID env var + socket file.
 * Returns false if either check fails, with 1s timeout [R14.3, R14.4].
 */
export declare function detectCmuxAvailable(): Promise<boolean>;
/**
 * Detect if tmux is available on the system.
 */
export declare function detectTmuxAvailable(): boolean;
/**
 * Detect project's own harness infrastructure.
 * For "cli": looks for test/e2e/*.spec.ts or test/e2e/*.test.ts
 * For "ui": looks for playwright.config.*, cypress.config.*, or .storybook/
 *
 * Returns the first matching file path, or null if none found.
 */
export declare function detectProjectHarness(kind: "cli" | "ui", projectDir?: string): Promise<string | null>;
