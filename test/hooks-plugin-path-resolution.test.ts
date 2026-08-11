/**
 * Regression test: hooks.json script paths must resolve under plugin install.
 *
 * Bug (reported against v3.6.0 plugin install): every hook command referenced
 * project-relative paths (`scripts/X.mjs`, `forge/scripts/X.mjs`,
 * `~/.claude/skills/forge/scripts/X.mjs`), but plugin install places scripts at
 * `${CLAUDE_PLUGIN_ROOT}/scripts/` — none of the three fallback paths resolve.
 * `Stop` hooks had no `|| true` and threw a visible `MODULE_NOT_FOUND` on every
 * Claude turn; other hooks silently no-op'd behind `|| true`.
 *
 * Fix: every hook command that invokes a `scripts/...` file MUST first try
 * `${CLAUDE_PLUGIN_ROOT:-}/scripts/...` (the plugin path, expanded by Claude
 * Code at hook runtime), then keep the existing 3-path fallback chain, then
 * `|| true`. This mirrors the already-correct `forge-sync-runtime.mjs` hook.
 *
 * This test encodes the fixed invariant so the regression cannot return.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const hooksPath = resolve(ROOT, "hooks/hooks.json");
const hooksFile = JSON.parse(readFileSync(hooksPath, "utf-8")) as {
  hooks: Record<string, Array<{ hooks: Array<{ command?: string }> }>>;
};

// Shell variable expansion expression matched literally in hook commands.
// Built via concatenation so biome's noTemplateCurlyInString rule doesn't fire
// on what is intentionally a literal `${...}` shell token, not a JS template.
const PLUGIN_ROOT_EXPR = "$" + "{CLAUDE_PLUGIN_ROOT:-}";

/** Commands that intentionally do not reference a scripts/ file (pure shell). */
function referencesScriptFile(command: string): boolean {
  return (
    /scripts\/[\w./-]+\.(?:mjs|sh|js)\b/.test(command) || /dist\/src\/[\w./-]+\.js\b/.test(command)
  );
}

/**
 * Protection hooks deliberately OMIT `|| true` so a non-zero exit propagates
 * and blocks the tool call (frozen-zone writes, task-completion gating).
 * Exempt them from the `|| true` requirement — but they still MUST resolve
 * under plugin install (the ${CLAUDE_PLUGIN_ROOT} invariant applies to all).
 */
function isProtectionHook(command: string): boolean {
  return command.includes("check-frozen.sh") || command.includes("check-sandbox.js");
}

describe("Plugin path resolution: hooks/hooks.json", () => {
  const allCommands: Array<{ loc: string; command: string }> = [];
  for (const [eventName, groups] of Object.entries(hooksFile.hooks)) {
    for (let gi = 0; gi < groups.length; gi++) {
      for (let hi = 0; hi < groups[gi].hooks.length; hi++) {
        const cmd = groups[gi].hooks[hi].command;
        if (typeof cmd === "string") {
          allCommands.push({ loc: `${eventName}[${gi}].hooks[${hi}]`, command: cmd });
        }
      }
    }
  }

  it("every command that references a scripts/ or dist/src/ file leads with $CLAUDE_PLUGIN_ROOT", () => {
    const violations: string[] = [];
    for (const { loc, command } of allCommands) {
      if (!referencesScriptFile(command)) continue;
      // The FIRST script invocation in the command must use the plugin root.
      const firstScriptArm = command.split("||")[0];
      if (!firstScriptArm.includes(PLUGIN_ROOT_EXPR)) {
        violations.push(
          `${loc}: first script arm does not use ${PLUGIN_ROOT_EXPR}.\n  command: ${command}`,
        );
      }
    }
    expect(violations, violations.join("\n\n")).toEqual([]);
  });

  it("every NON-protection command that references a scripts/ file ends with `|| true`", () => {
    // The Stop bug: non-protection hooks threw visible MODULE_NOT_FOUND because
    // they had no `|| true`. Protection hooks (frozen-check, task-completed
    // gate) intentionally propagate non-zero exit codes — exempt them.
    const violations: string[] = [];
    for (const { loc, command } of allCommands) {
      if (!referencesScriptFile(command)) continue;
      if (isProtectionHook(command)) continue;
      if (!/\|\|\s*true\s*(;\s*fi\s*)?$/.test(command.trim())) {
        violations.push(`${loc}: missing trailing \`|| true\`.\n  command: ${command}`);
      }
    }
    expect(violations, violations.join("\n\n")).toEqual([]);
  });

  it("Stop hooks specifically all resolve via $CLAUDE_PLUGIN_ROOT AND fall back with || true", () => {
    // The original bug was most visible on Stop (7 visible errors). Lock it down
    // explicitly so a future edit cannot regress just the Stop section.
    const stopGroups = hooksFile.hooks.Stop ?? [];
    expect(stopGroups.length).toBeGreaterThanOrEqual(4);

    const violations: string[] = [];
    for (let gi = 0; gi < stopGroups.length; gi++) {
      for (const hook of stopGroups[gi].hooks) {
        const cmd = hook.command ?? "";
        if (!cmd.includes(PLUGIN_ROOT_EXPR)) {
          violations.push(`Stop[${gi}]: missing ${PLUGIN_ROOT_EXPR} in: ${cmd}`);
        }
        if (!/\|\|\s*true\s*$/.test(cmd.trim())) {
          violations.push(`Stop[${gi}]: missing trailing || true in: ${cmd}`);
        }
      }
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
