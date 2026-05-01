/**
 * SDK Hooks Validation — validates the presence and structure of the
 * hooks configuration file.
 *
 * Extracted from `sdk-driver.ts` as a standalone module with a single
 * responsibility: checking that `hooks/hooks.json` exists and contains
 * a `PreToolUse` section.
 *
 * Design reference: sdk-driver-decomposition § design.md
 * **Validates: Requirements 2.2, 2.4, 2.6, 10.3**
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Validate that the hooks configuration file exists and contains a
 * `PreToolUse` section. This is a pure-function check used at startup
 * to warn when the outer protection layer (hooks) is missing.
 *
 * @param cwd - The working directory (repository root) to check.
 * @returns An object with `valid: true` if hooks are present, or
 *   `valid: false` with a `reason` string explaining the issue.
 */
export function validateHooksPresence(cwd: string): { valid: boolean; reason?: string } {
  const hooksPath = join(cwd, "hooks", "hooks.json");
  if (!existsSync(hooksPath)) {
    return { valid: false, reason: "hooks/hooks.json not found" };
  }
  try {
    const content = readFileSync(hooksPath, "utf-8");
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed?.hooks?.PreToolUse)) {
      return { valid: false, reason: "PreToolUse section missing in hooks.json" };
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: "hooks.json parse failed" };
  }
}
