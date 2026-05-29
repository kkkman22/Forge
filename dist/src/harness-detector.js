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
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { globSync } from "glob";
const CMUX_SOCKET_TIMEOUT = 1000;
/**
 * Detect if cmux is available via workspace ID env var + socket file.
 * Returns false if either check fails, with 1s timeout [R14.3, R14.4].
 */
export async function detectCmuxAvailable() {
    try {
        const workspaceId = process.env.CMUX_WORKSPACE_ID;
        if (!workspaceId)
            return false;
        const socketPath = process.env.CMUX_SOCKET_PATH || `/tmp/cmux-${workspaceId}.sock`;
        return await new Promise((resolve) => {
            const timer = setTimeout(() => resolve(false), CMUX_SOCKET_TIMEOUT);
            try {
                resolve(existsSync(socketPath));
            }
            catch {
                resolve(false);
            }
            finally {
                clearTimeout(timer);
            }
        });
    }
    catch {
        return false;
    }
}
/**
 * Detect if tmux is available on the system.
 */
export function detectTmuxAvailable() {
    try {
        execSync("which tmux 2>/dev/null", { encoding: "utf-8", timeout: 3000 });
        return true;
    }
    catch {
        return false;
    }
}
/**
 * Detect project's own harness infrastructure.
 * For "cli": looks for test/e2e/*.spec.ts or test/e2e/*.test.ts
 * For "ui": looks for playwright.config.*, cypress.config.*, or .storybook/
 *
 * Returns the first matching file path, or null if none found.
 */
export async function detectProjectHarness(kind, projectDir) {
    try {
        const cwd = projectDir ?? process.cwd();
        if (!existsSync(cwd))
            return null;
        if (kind === "cli") {
            const patterns = [
                join(cwd, "test", "e2e", "*.spec.ts"),
                join(cwd, "test", "e2e", "*.test.ts"),
                join(cwd, "test", "e2e", "*.spec.js"),
                join(cwd, "test", "e2e", "*.test.js"),
            ];
            for (const pattern of patterns) {
                const matches = globSync(pattern);
                if (matches.length > 0)
                    return matches[0];
            }
        }
        if (kind === "ui") {
            const uiPatterns = [join(cwd, "playwright.config.*"), join(cwd, "cypress.config.*")];
            for (const pattern of uiPatterns) {
                const matches = globSync(pattern);
                if (matches.length > 0)
                    return matches[0];
            }
            if (existsSync(join(cwd, ".storybook"))) {
                return join(cwd, ".storybook");
            }
        }
        return null;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=harness-detector.js.map