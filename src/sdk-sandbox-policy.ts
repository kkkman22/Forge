/**
 * SDK Sandbox Policy — loads and validates the sandbox permission policy
 * from the project's `.tinkerman/sandbox.json` configuration file.
 *
 * Extracted from `sdk-driver.ts` as part of the SDK Driver Decomposition.
 * Design reference: sdk-driver-decomposition § design.md
 * **Validates: Requirements 2.1, 10.2**
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildDefaultPolicy, type PermissionPolicy, validatePolicy } from "./sandbox-policy.js";

// ---------------------------------------------------------------------------
// Sandbox policy loading
// ---------------------------------------------------------------------------

/**
 * Load sandbox policy from .tinkerman/sandbox.json or return default.
 * Validates the config and falls back to default on validation failure.
 */
export function loadSandboxPolicy(cwd: string): PermissionPolicy {
  const configPath = join(cwd, ".tinkerman", "sandbox.json");

  if (existsSync(configPath)) {
    try {
      const raw = JSON.parse(readFileSync(configPath, "utf-8"));
      const validation = validatePolicy(raw);
      if (validation.valid) {
        return raw as PermissionPolicy;
      }
      // Log validation errors but continue with default
    } catch (_err: unknown) {
      // Parse error — fall back to default
    }
  }

  return buildDefaultPolicy(cwd);
}
