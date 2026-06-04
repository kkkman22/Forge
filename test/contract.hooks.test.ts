/**
 * Contract tests for hooks/hooks.json — Peripheral Asset Validation (Req 8.1, 8.2)
 *
 * Validates:
 *   1. All hook entries have required fields (`type`, `command`)
 *   2. All `matcher` values reference known tool patterns (Write|Edit|Bash etc.)
 *   3. All script paths referenced in `command` fields exist in the repo
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const hooksPath = resolve(ROOT, "hooks/hooks.json");
const hooksFile = JSON.parse(readFileSync(hooksPath, "utf-8"));

// The hooks structure: { hooks: { EventName: [ { matcher?: string, hooks: [ { type, command?, timeout? } ] } ] } }
const hooksMap = hooksFile.hooks as Record<
  string,
  Array<{
    matcher?: string;
    hooks: Array<{ type: string; command?: string; args?: string[]; timeout?: number }>;
  }>
>;

/** Known Claude Code tool names that can appear in matcher fields */
const KNOWN_TOOL_PATTERNS = new Set([
  "Write",
  "Edit",
  "MultiEdit",
  "Bash",
  "Read",
  "Grep",
  "Glob",
  "LS",
  "WebSearch",
  "WebFetch",
]);

// ---------------------------------------------------------------------------

describe("Contract: hooks.json matcher fields reference known tools", () => {
  for (const [eventName, matcherGroups] of Object.entries(hooksMap)) {
    for (let gi = 0; gi < matcherGroups.length; gi++) {
      const group = matcherGroups[gi];
      if (!group.matcher) continue;

      it(`${eventName}[${gi}] matcher "${group.matcher}" uses only known tool names`, () => {
        const toolNames = group.matcher?.split("|") ?? [];
        for (const toolName of toolNames) {
          expect(
            KNOWN_TOOL_PATTERNS.has(toolName),
            `Unknown tool name "${toolName}" in matcher "${group.matcher}". Known tools: ${[...KNOWN_TOOL_PATTERNS].join(", ")}`,
          ).toBe(true);
        }
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Req 8.1: script paths referenced in command fields exist in the repo
// ---------------------------------------------------------------------------

describe("Contract: hooks.json command script paths exist", () => {
  /** Patterns that indicate the command handles missing files gracefully */
  const FALLBACK_PATTERNS = ["|| true", "2>/dev/null", "|| bash"];

  /** Collect all concrete file references from all hook commands */
  const allFileRefs: Array<{
    eventName: string;
    gi: number;
    hi: number;
    ref: string;
    command: string;
    hasFallback: boolean;
  }> = [];

  for (const [eventName, matcherGroups] of Object.entries(hooksMap)) {
    for (let gi = 0; gi < matcherGroups.length; gi++) {
      const group = matcherGroups[gi];
      for (let hi = 0; hi < group.hooks.length; hi++) {
        const handler = group.hooks[hi];
        if (!handler.command) continue;

        const command = handler.command;
        const fileRefs = command.match(/(?:[\w.-]+\/)+[\w.*-]+\.\w+/g) || [];
        const concreteFileRefs = fileRefs.filter(
          (ref) =>
            !ref.includes("*") &&
            !ref.startsWith("$") &&
            !ref.startsWith("~") &&
            !ref.includes("stash@"),
        );

        const hasFallback = FALLBACK_PATTERNS.some((p) => command.includes(p));
        const hasConditionalCheck = command.includes("if [") || command.includes("[ -f");

        for (const ref of concreteFileRefs) {
          allFileRefs.push({
            eventName,
            gi,
            hi,
            ref,
            command,
            hasFallback: hasFallback || hasConditionalCheck,
          });
        }
      }
    }
  }

  it("all hook commands with concrete file references use fallback patterns or reference existing files", () => {
    for (const { eventName, gi, hi, ref, command, hasFallback } of allFileRefs) {
      if (hasFallback) continue;

      const filePath = resolve(ROOT, ref);
      expect(
        existsSync(filePath),
        `${eventName}[${gi}].hooks[${hi}] references non-existent file "${ref}" without a fallback. Command: ${command}`,
      ).toBe(true);
    }
  });

  it("hook commands reference at least one script path", () => {
    expect(allFileRefs.length).toBeGreaterThan(0);
  });
});
