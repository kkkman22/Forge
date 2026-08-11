/**
 * PBT for hooks config integrity — forbids unbounded head/tail/cat injection.
 *
 * Property 4: No hook config may contain commands matching
 * `head|tail|cat .tinkerman/(plans|progress)/.*` without a byte/line limit.
 *
 * Also validates all 3 config files as static fixtures.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as fc from "fast-check";
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

/** Match unbounded head/tail/cat on .tinkerman/plans or .tinkerman/progress */
const UNBOUNDED_FORGE_READ = /(?:head|tail|cat)\s+.*\.tinkerman\/(?:plans|progress)\//;

/** Acceptable byte limit markers (line-based limits like head -N are NOT safe on globs) */
const HAS_LIMIT =
  /(?:head\s+-c\s+\d+|tail\s+-c\s+\d+|\|.*head\s+-c\s+\d+|MAX_TOTAL_CHARS|maxBytes|maxBytes\s*=\s*\d+|inject-plan-context\.mjs|inject-evolved-rules\.mjs)/;

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

  // Only check injection hooks: SessionStart + UserPromptSubmit
  const injectionEvents = ["SessionStart", "UserPromptSubmit"];
  for (const eventName of injectionEvents) {
    const entries = hooks[eventName];
    if (!entries) continue;
    for (const group of entries) {
      const inner = (group as { hooks?: HookEntry[] }).hooks ?? [];
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
  it("no config contains unbounded head/tail/cat on .tinkerman/plans or .tinkerman/progress", () => {
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

  it("PBT: checker correctly classifies known bad vs safe commands", () => {
    const badCommands = [
      "head -50 .tinkerman/plans/*.md",
      "tail -20 .tinkerman/progress/*.md",
      "cat .tinkerman/plans/plan.md",
      "head .tinkerman/plans/test.md",
      "tail .tinkerman/progress/prog.md",
      "cat .tinkerman/plans/active.md 2>/dev/null",
    ];

    const safeCommands = [
      "echo hello",
      "node scripts/inject-plan-context.mjs",
      "cat /etc/passwd",
      "ls -la .tinkerman/",
      "node forge/scripts/inject-evolved-rules.mjs 2>/dev/null || true",
      "head -c 4096 .tinkerman/plans/plan.md",
      "tail -c 8192 .tinkerman/progress/prog.md",
    ];

    // Bad commands must be detected (match pattern, no limit)
    for (const cmd of badCommands) {
      expect(UNBOUNDED_FORGE_READ.test(cmd)).toBe(true);
      expect(HAS_LIMIT.test(cmd)).toBe(false);
    }

    // Safe commands must not be flagged
    for (const cmd of safeCommands) {
      const matchesPattern = UNBOUNDED_FORGE_READ.test(cmd);
      const hasLimit = HAS_LIMIT.test(cmd);
      // Either doesn't match the pattern, or has a limit
      expect(matchesPattern && !hasLimit).toBe(false);
    }

    // PBT: arbitrary strings never cause the regex to throw
    fc.assert(
      fc.property(fc.string({ maxLength: 500 }), (s) => {
        expect(() => UNBOUNDED_FORGE_READ.test(s)).not.toThrow();
        expect(() => HAS_LIMIT.test(s)).not.toThrow();
      }),
      { numRuns: 50 },
    );
  });
});
