/**
 * PBT for hooks config integrity — forbids unbounded head/tail/cat injection.
 *
 * Property 4: No hook config may contain commands matching
 * `head|tail|cat .forge/(plans|progress)/.*` without a byte/line limit.
 *
 * Also validates all 3 config files as static fixtures.
 */
import * as fc from "fast-check";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CONFIG_PATHS = [
  join(process.cwd(), ".claude", "settings.json"),
  join(process.cwd(), ".claude-plugin", "plugin.json"),
  join(process.cwd(), "hooks", "hooks.json"),
];

interface HookEntry {
  type?: string;
  command?: string;
  matcher?: string;
  timeout?: number;
}

/** Match unbounded head/tail/cat on .forge/plans or .forge/progress */
const UNBOUNDED_FORGE_READ =
  /(?:head|tail|cat)\s+.*\.forge\/(?:plans|progress)\//;

/** Acceptable byte/line limit markers */
const HAS_LIMIT = /(?:head\s+-[cn]\s+\d+|head\s+-\d{1,2}[^0-9]|tail\s+-[cn]\s+\d+|\|.*head\s+-c\s+\d+|MAX_TOTAL_CHARS|maxBytes|maxBytes\s*=\s*\d+)/;

function extractCommands(configPath: string): { path: string; command: string }[] {
  let raw: string;
  try {
    raw = readFileSync(configPath, "utf-8");
  } catch {
    return [];
  }

  const json = JSON.parse(raw);
  const hooks = json.hooks ?? json;
  const commands: { path: string; command: string }[] = [];

  for (const entries of Object.values(hooks) as HookEntry[][]) {
    for (const group of entries) {
      const inner = group.hooks ?? [];
      for (const h of inner) {
        if (h.command) {
          commands.push({ path: configPath, command: h.command });
        }
      }
    }
  }

  return commands;
}

describe("hooks config integrity", () => {
  it("no config contains unbounded head/tail/cat on .forge/plans or .forge/progress", () => {
    const violations: string[] = [];

    for (const configPath of CONFIG_PATHS) {
      const cmds = extractCommands(configPath);
      for (const { path, command } of cmds) {
        if (UNBOUNDED_FORGE_READ.test(command) && !HAS_LIMIT.test(command)) {
          violations.push(`${path}: ${command.slice(0, 100)}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("PBT: any command fragment with unbounded forge read is rejected by the checker", () => {
    fc.assert(
      fc.property(
        fc.record({
          command: fc.oneof(
            fc.constant("head -50 .forge/plans/*.md"),
            fc.constant("tail -20 .forge/progress/*.md"),
            fc.constant("cat .forge/plans/plan.md"),
            fc.constant("head .forge/plans/test.md"),
            fc.constant("tail .forge/progress/prog.md"),
            fc.constant("echo hello"),
            fc.constant("node scripts/inject-plan-context.mjs"),
            fc.constant("cat /etc/passwd"),
          ),
          timeout: fc.integer({ min: 1, max: 30 }),
        }),
        (fragment) => {
          const cmd = fragment.command;
          const matchesPattern = UNBOUNDED_FORGE_READ.test(cmd);
          const hasLimit = HAS_LIMIT.test(cmd);

          // If matches unbounded forge read pattern, it must have a limit
          if (matchesPattern) {
            expect(hasLimit).toBe(true);
          }
        },
      ),
      { numRuns: 30 },
    );
  });
});
