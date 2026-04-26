/**
 * Bug Condition Exploration Test: Frozen Zone Hook Swallows Exit Code
 *
 * Property 3 (Bug Condition): For all PreToolUse hooks that invoke check-frozen.sh
 * (matchers "Write|Edit" and "Bash"), the command string must NOT end with `|| true`,
 * which would swallow the non-zero exit code from check-frozen.sh and render
 * frozen file protection ineffective.
 *
 * Bug Condition from design:
 *   input.context.hookMatcher IN ["Write|Edit", "Bash"]
 *   AND input.context.targetFile matches frozen zone pattern
 *   AND check-frozen.sh would exit 1
 *   AND hook chain exit code == 0 (swallowed by || true)
 *
 * Expected Behavior from design:
 *   The hook chain SHALL propagate the non-zero exit code from check-frozen.sh,
 *   causing the write operation to be blocked.
 *
 * This test is EXPECTED TO FAIL on unfixed code — failure confirms the bug exists.
 *
 * **Validates: Requirements 1.3, 2.3**
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Load and parse hooks.json
// ---------------------------------------------------------------------------

interface HookEntry {
  type: string;
  command: string;
  timeout?: number;
}

interface HookMatcher {
  matcher?: string;
  hooks: HookEntry[];
}

interface HooksConfig {
  hooks: Record<string, HookMatcher[]>;
}

function loadHooksConfig(): HooksConfig {
  const hooksPath = resolve(process.cwd(), "hooks/hooks.json");
  const content = readFileSync(hooksPath, "utf-8");
  return JSON.parse(content) as HooksConfig;
}

// ---------------------------------------------------------------------------
// Extract frozen-check commands from PreToolUse hooks
// ---------------------------------------------------------------------------

interface FrozenCheckHook {
  matcher: string;
  command: string;
}

function extractFrozenCheckHooks(config: HooksConfig): FrozenCheckHook[] {
  const preToolUseHooks = config.hooks.PreToolUse ?? [];
  const frozenChecks: FrozenCheckHook[] = [];

  for (const hookGroup of preToolUseHooks) {
    const matcher = hookGroup.matcher ?? "";
    // Only look at Write|Edit and Bash matchers (not Write|Edit|Bash which is the plan context hook)
    if (matcher !== "Write|Edit" && matcher !== "Bash") {
      continue;
    }

    for (const hook of hookGroup.hooks) {
      // Match both check-frozen.sh (legacy) and check-frozen.js (TypeScript rewrite)
      if (hook.command.includes("check-frozen.sh") || hook.command.includes("check-frozen.js")) {
        frozenChecks.push({ matcher, command: hook.command });
      }
    }
  }

  return frozenChecks;
}

// ---------------------------------------------------------------------------
// Bug Condition Exploration: Frozen Zone Hook Exit Code Swallowing
// ---------------------------------------------------------------------------

describe("Bug Condition: Frozen zone hook chain swallows exit codes via || true", () => {
  const config = loadHooksConfig();
  const frozenCheckHooks = extractFrozenCheckHooks(config);

  it("should find frozen-check hooks for both Write|Edit and Bash matchers", () => {
    const matchers = frozenCheckHooks.map((h) => h.matcher);
    expect(matchers).toContain("Write|Edit");
    expect(matchers).toContain("Bash");
  });

  it("frozen-check hook commands must NOT end with || true (property-based)", () => {
    // Use fast-check to iterate over all frozen-check hooks found
    // This is a scoped PBT: the "arbitrary" draws from the actual hook entries
    const frozenCheckArb = fc.constantFrom(...frozenCheckHooks);

    fc.assert(
      fc.property(frozenCheckArb, ({ command }) => {
        // The command string for frozen-check hooks must NOT have a trailing `|| true`
        // that would swallow the exit code from check-frozen.sh.
        //
        // We trim whitespace and check if the command ends with `|| true`.
        // For the Bash matcher, the command wraps in a `while...done` loop,
        // so we check if `|| true` appears as the last operation before `done`
        // or at the very end of the command.
        const trimmed = command.trim();

        // Check: command must not end with `|| true`
        const endsWithOrTrue = /\|\|\s*true\s*(;?\s*done\s*)?$/.test(trimmed);

        expect(endsWithOrTrue).toBe(false);

        return !endsWithOrTrue;
      }),
      { numRuns: 100 },
    );
  });

  it("Write|Edit frozen-check command must not swallow check-frozen exit code", () => {
    const writeEditHook = frozenCheckHooks.find((h) => h.matcher === "Write|Edit");
    expect(writeEditHook).toBeDefined();

    // The command should NOT end with `|| true`
    const command = writeEditHook?.command.trim();
    expect(command).not.toMatch(/\|\|\s*true\s*$/);
  });

  it("Bash frozen-check command must not swallow check-frozen exit code", () => {
    const bashHook = frozenCheckHooks.find((h) => h.matcher === "Bash");
    expect(bashHook).toBeDefined();

    // The inner loop command should NOT have `|| true` before `done`
    // which would swallow the exit code from check-frozen
    const command = bashHook?.command.trim();
    expect(command).not.toMatch(/\|\|\s*true\s*;\s*done/);
    expect(command).not.toMatch(/\|\|\s*true\s*$/);
  });
});
