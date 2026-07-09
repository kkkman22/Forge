import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Dynamic import with cache-busting query, mirroring plugin-data-path.test.ts convention.
const modulePath = resolve(__dirname, "../../scripts/lib/zcode-platform.mjs");

const ZCODE_SIGNALS = [
  "ZCODE_PLUGIN_ROOT",
  "ZCODE_PROJECT_DIR",
  "ZCODE_SESSION_ID",
  "ZCODE_PLUGIN_DATA",
] as const;

describe("zcode-platform", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Snapshot + clear all ZCode signals so each test starts from a known (Claude) baseline.
    for (const k of ZCODE_SIGNALS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ZCODE_SIGNALS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  async function importFresh() {
    return await import(`${modulePath}?t=${Date.now()}`);
  }

  describe("isZCodeRuntime", () => {
    it("returns false when no ZCODE_* signal is present (fail-safe = Claude)", async () => {
      const { isZCodeRuntime } = await importFresh();
      expect(isZCodeRuntime()).toBe(false);
    });

    it("returns true when ZCODE_PLUGIN_ROOT is set", async () => {
      process.env.ZCODE_PLUGIN_ROOT =
        "/Users/x/.zcode/cli/plugins/cache/forge-official/forge/3.9.0";
      const { isZCodeRuntime } = await importFresh();
      expect(isZCodeRuntime()).toBe(true);
    });

    it("returns true when ZCODE_PROJECT_DIR is set (even if PLUGIN_ROOT absent)", async () => {
      process.env.ZCODE_PROJECT_DIR = "/Users/x/code/proj";
      const { isZCodeRuntime } = await importFresh();
      expect(isZCodeRuntime()).toBe(true);
    });

    it("returns true when only ZCODE_SESSION_ID is set", async () => {
      process.env.ZCODE_SESSION_ID = "sess_abc123";
      const { isZCodeRuntime } = await importFresh();
      expect(isZCodeRuntime()).toBe(true);
    });

    it("treats empty-string signal as absent (fail-safe)", async () => {
      process.env.ZCODE_PLUGIN_ROOT = "";
      const { isZCodeRuntime } = await importFresh();
      expect(isZCodeRuntime()).toBe(false);
    });
  });

  describe("pruneHookOutput — Claude Code path (unchanged)", () => {
    it("returns the object byte-for-byte unchanged when no ZCODE signal", async () => {
      const { pruneHookOutput } = await importFresh();
      const output = {
        additionalContext: "rules content",
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          reloadSkills: true,
          sessionTitle: "Forge: x",
        },
      };
      const result = pruneHookOutput(output, "SessionStart");
      expect(result).toBe(output); // same reference, not a copy
      expect(result).toEqual(output);
    });

    it("preserves updatedDisplay on Claude path", async () => {
      const { pruneHookOutput } = await importFresh();
      const output = { hookSpecificOutput: { updatedDisplay: "content" } };
      const result = pruneHookOutput(output, "PostToolUse");
      expect(result).toBe(output);
    });
  });

  describe("pruneHookOutput — ZCode path (whitelist only)", () => {
    beforeEach(() => {
      process.env.ZCODE_PLUGIN_ROOT = "/x/forge/3.9.0";
    });

    it("keeps additionalContext and drops hookSpecificOutput on SessionStart", async () => {
      const { pruneHookOutput } = await importFresh();
      const output = {
        additionalContext: "rules content",
        hookSpecificOutput: {
          hookEventName: "SessionStart",
          reloadSkills: true,
          sessionTitle: "Forge: x",
        },
      };
      const result = pruneHookOutput(output, "SessionStart");
      expect(Object.keys(result).sort()).toEqual(["additionalContext"]);
      expect(result.additionalContext).toBe("rules content");
      expect(result).not.toHaveProperty("hookSpecificOutput");
    });

    it("drops updatedDisplay on PostToolUse ZCode path", async () => {
      const { pruneHookOutput } = await importFresh();
      const output = {
        hookSpecificOutput: { updatedDisplay: "content" },
        updatedToolOutput: "real",
      };
      const result = pruneHookOutput(output, "PostToolUse");
      expect(Object.keys(result).sort()).toEqual(["updatedToolOutput"]);
      expect(result).not.toHaveProperty("hookSpecificOutput");
    });

    it("keeps decision + systemMessage on PreToolUse ZCode path", async () => {
      const { pruneHookOutput } = await importFresh();
      const output = {
        decision: "deny",
        systemMessage: "blocked",
        additionalContext: "why",
        hookSpecificOutput: { custom: true },
      };
      const result = pruneHookOutput(output, "PreToolUse");
      expect(Object.keys(result).sort()).toEqual([
        "additionalContext",
        "decision",
        "systemMessage",
      ]);
    });

    it("does not mutate the input object", async () => {
      const { pruneHookOutput } = await importFresh();
      const output = { additionalContext: "x", hookSpecificOutput: { reloadSkills: true } };
      pruneHookOutput(output, "SessionStart");
      expect(output.hookSpecificOutput).toEqual({ reloadSkills: true });
    });

    it("additionalContext value/structure unchanged by pruning", async () => {
      const { pruneHookOutput } = await importFresh();
      const ctx = { nested: { deep: "value" }, list: [1, 2, 3] };
      const output = { additionalContext: ctx, hookSpecificOutput: { x: 1 } };
      const result = pruneHookOutput(output, "SessionStart");
      expect(result.additionalContext).toBe(ctx); // same reference, value untouched
    });
  });

  describe("zcodeWhitelist", () => {
    it("always includes additionalContext", async () => {
      const { zcodeWhitelist } = await importFresh();
      for (const ev of ["SessionStart", "PreToolUse", "PostToolUse", "Stop", "UnknownEvent"]) {
        expect(zcodeWhitelist(ev)).toContain("additionalContext");
      }
    });

    it("includes decision/systemMessage for PreToolUse", async () => {
      const { zcodeWhitelist } = await importFresh();
      const wl = zcodeWhitelist("PreToolUse");
      expect(wl).toContain("decision");
      expect(wl).toContain("systemMessage");
    });

    it("includes updatedToolOutput for PostToolUse", async () => {
      const { zcodeWhitelist } = await importFresh();
      expect(zcodeWhitelist("PostToolUse")).toContain("updatedToolOutput");
    });

    it("pruneHookOutput with unknown event falls back to universal-only on ZCode", async () => {
      process.env.ZCODE_PLUGIN_ROOT = "/x/forge/3.9.0";
      const { pruneHookOutput } = await importFresh();
      const output = { additionalContext: "ctx", foo: "bar", baz: 1 };
      const result = pruneHookOutput(output, "TotallyUnknownEvent");
      expect(Object.keys(result).sort()).toEqual(["additionalContext"]);
      expect(result.additionalContext).toBe("ctx");
    });
  });
});
