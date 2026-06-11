import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { HooksProtectionMissingError } from "./forge-error.js";

/**
 * Validates that `hooks/hooks.json` exists and contains a `PreToolUse` section.
 *
 * Forge runs with `bypassPermissions` enabled, relying on PreToolUse hooks to
 * enforce frozen-zone protection. When hooks are absent, the loop must
 * **fail closed** — aborting before any agent invocation — to prevent silent
 * protection bypass.
 *
 * Throws {@link HooksProtectionMissingError} if validation fails.
 *
 * **Validates: v2.4 Requirement 1.1**
 *
 * @param projectRoot - The project root directory containing `hooks/hooks.json`
 * @param options.skipValidation - When true, skips validation (for `--force-no-hooks`)
 */
export function validateHooksPresence(
  projectRoot: string,
  options?: { skipValidation?: boolean },
): void {
  if (options?.skipValidation) return;

  const hooksPath = join(projectRoot, "hooks", "hooks.json");

  if (!existsSync(hooksPath)) {
    throw new HooksProtectionMissingError("hooks/hooks.json not found", projectRoot);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(hooksPath, "utf-8"));
  } catch {
    throw new HooksProtectionMissingError("hooks.json parse failed", projectRoot);
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    !("PreToolUse" in parsed) ||
    !Array.isArray((parsed as Record<string, unknown>).PreToolUse) ||
    (parsed as Record<string, unknown[]>).PreToolUse.length === 0
  ) {
    throw new HooksProtectionMissingError(
      "PreToolUse section missing in hooks.json",
      projectRoot,
    );
  }
}
