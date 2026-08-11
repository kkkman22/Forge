/**
 * SDK Skill Detection — detects whether Skill-aware mode should be enabled
 * by checking for the `.tinkerman/` directory in the working directory.
 *
 * This module contains only skill-aware mode detection logic and its direct
 * dependencies (`existsSync`, `join`).
 *
 * Design reference: sdk-driver-decomposition § design.md
 * **Validates: Requirements 2.3, 10.4**
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Skill-aware mode detection
// ---------------------------------------------------------------------------

/**
 * Detect whether Skill-aware mode should be enabled by checking if the
 * `.tinkerman/` directory exists in the given working directory.
 *
 * @param cwd - The working directory (repository root) to check.
 * @returns `true` if `.tinkerman/` directory exists, `false` otherwise.
 */
export function detectSkillAwareMode(cwd: string): boolean {
  try {
    return existsSync(join(cwd, ".tinkerman"));
  } catch (err) {
    // biome-ignore lint/suspicious/noConsole: standalone utility without logger access
    console.error(
      `[debug] detectSkillAwareMode failed for "${cwd}": ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }
}
