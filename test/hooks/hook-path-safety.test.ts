import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * P1-2 regression guard: hook commands must NOT contain bare relative
 * fallback branches (`|| node scripts/X`, `|| bash scripts/X`,
 * `|| node forge/scripts/X`). These resolve to the victim project's CWD when
 * the hook runs — a malicious repo shipping `scripts/<referenced-name>.mjs`
 * would execute on SessionStart/Stop with no user interaction (RCE).
 *
 * Allowed absolute forms only:
 *   - `${CLAUDE_PLUGIN_ROOT}/scripts/X`  (marketplace install)
 *   - `~/.claude/skills/forge/scripts/X`  (skill install fallback)
 *
 * The source `hooks/hooks.json` and its two generated copies must all stay in
 * sync (check-bundle-sync asserts file presence; this test asserts content
 * safety).
 */
const HOOK_FILES = [
  "hooks/hooks.json",
  "dist-plugin/hooks/hooks.json",
  "dist/claude-code/bundles/forge/hooks/hooks.json",
];

const REPO_ROOT = join(import.meta.dirname, "..", "..");

/**
 * Bare relative branches we must reject. Each matches a `|| <invoker> <relpath>`
 * arm where <relpath> is CWD-relative (scripts/... or forge/scripts/...).
 *
 * `\b(node|bash|sh)\s+(scripts|forge/scripts|dist/src)/` — an invocation of a
 * path relative to CWD, i.e. the victim's repo. (Absolute invokers use
 * `${CLAUDE_PLUGIN_ROOT:-}/`, `~/...`, or `${CLAUDE_PROJECT_DIR}/`.)
 */
const BARE_RELATIVE_BRANCH = /\|\|\s*(?:node|bash|sh)\s+(?:scripts\/|forge\/scripts\/|dist\/src\/)/;

describe("hook path safety — no bare relative fallback branches (P1-2)", () => {
  for (const relPath of HOOK_FILES) {
    describe(relPath, () => {
      const content = readFileSync(join(REPO_ROOT, relPath), "utf-8");
      const parsed = JSON.parse(content) as Record<string, unknown>;
      const hooks = parsed.hooks as Record<string, unknown>;

      for (const [event, blocks] of Object.entries(hooks)) {
        it(`${event}: every hook command uses absolute script paths only`, () => {
          const commands = collectCommands(blocks);
          expect(commands.length, `${event} should have ≥1 command`).toBeGreaterThan(0);
          for (const cmd of commands) {
            expect(
              BARE_RELATIVE_BRANCH.test(cmd),
              `bare relative fallback branch in:\n  ${cmd}\n` +
                "Remove `|| node scripts/X` / `|| bash scripts/X` / `|| node forge/scripts/X` " +
                "arms — they resolve to the victim CWD. Keep only `${CLAUDE_PLUGIN_ROOT}` " +
                "and `~/.claude/skills/forge` absolute arms.",
            ).toBe(false);
          }
        });
      }
    });
  }
});

/** Recursively collect every `command` string from a hook blocks structure. */
function collectCommands(blocks: unknown): string[] {
  const out: string[] = [];
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const n of node) visit(n);
      return;
    }
    if (node && typeof node === "object") {
      const rec = node as Record<string, unknown>;
      if (typeof rec.command === "string") out.push(rec.command);
      if (Array.isArray(rec.hooks)) visit(rec.hooks);
    }
  };
  visit(blocks);
  return out;
}
