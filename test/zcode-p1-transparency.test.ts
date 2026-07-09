/**
 * T11 (R6): dual-platform transparency aggregate regression.
 *
 * Guards that P1 changes leave Claude Code behavior byte-for-byte unchanged.
 * Three pillars:
 *   R6.1 — init default path (no --platform) produces no .zcode (covered by init-flags F8c).
 *   R6.2 — hook output on Claude path == baseline (covered by zcode-platform + inject-evolved-rules tests).
 *   This file — a single entry point that re-asserts the core transparency invariants
 *   so a regression in any one surfaces here.
 */
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PLATFORM_MODULE = resolve(__dirname, "../scripts/lib/zcode-platform.mjs");

describe("T11 — dual-platform transparency (R6 aggregate)", () => {
  it("pruneHookOutput is a no-op (same reference) when no ZCode signal — Claude output byte-equal", async () => {
    const { pruneHookOutput } = await import(`${PLATFORM_MODULE}?t=${Date.now()}`);
    const baseline = {
      additionalContext: "rules",
      hookSpecificOutput: {
        hookEventName: "SessionStart",
        reloadSkills: true,
        sessionTitle: "Forge: x",
      },
    };
    const result = pruneHookOutput(baseline, "SessionStart");
    // Same reference = byte-equal, not a copy. Claude-side never mutated.
    expect(result).toBe(baseline);
    expect(result.hookSpecificOutput.reloadSkills).toBe(true);
    expect(result.hookSpecificOutput.sessionTitle).toBe("Forge: x");
  });

  it("empty-string ZCODE signals are treated as absent (fail-safe to Claude)", async () => {
    const { isZCodeRuntime } = await import(`${PLATFORM_MODULE}?t=${Date.now()}`);
    const saved = process.env.ZCODE_PLUGIN_ROOT;
    process.env.ZCODE_PLUGIN_ROOT = "";
    try {
      expect(isZCodeRuntime()).toBe(false);
    } finally {
      if (saved === undefined) delete process.env.ZCODE_PLUGIN_ROOT;
      else process.env.ZCODE_PLUGIN_ROOT = saved;
    }
  });

  it("pruneHookOutput does not mutate the input even on ZCode path (caller's object intact)", async () => {
    const { pruneHookOutput } = await import(`${PLATFORM_MODULE}?t=${Date.now()}`);
    const saved = process.env.ZCODE_PLUGIN_ROOT;
    process.env.ZCODE_PLUGIN_ROOT = "/x/forge";
    try {
      const input = { additionalContext: "x", hookSpecificOutput: { reloadSkills: true } };
      const result = pruneHookOutput(input, "SessionStart");
      expect(result).not.toBe(input); // ZCode path returns a new object
      expect(input.hookSpecificOutput).toEqual({ reloadSkills: true }); // input untouched
    } finally {
      if (saved === undefined) delete process.env.ZCODE_PLUGIN_ROOT;
      else process.env.ZCODE_PLUGIN_ROOT = saved;
    }
  });

  it("whitelist always retains additionalContext value structure (nested objects unchanged)", async () => {
    const { pruneHookOutput } = await import(`${PLATFORM_MODULE}?t=${Date.now()}`);
    const saved = process.env.ZCODE_PLUGIN_ROOT;
    process.env.ZCODE_PLUGIN_ROOT = "/x/forge";
    try {
      const ctx = { nested: { deep: "v" }, list: [1, 2] };
      const result = pruneHookOutput(
        { additionalContext: ctx, hookSpecificOutput: { x: 1 } },
        "SessionStart",
      );
      expect(result.additionalContext).toBe(ctx); // same ref, value/structure preserved
    } finally {
      if (saved === undefined) delete process.env.ZCODE_PLUGIN_ROOT;
      else process.env.ZCODE_PLUGIN_ROOT = saved;
    }
  });
});
