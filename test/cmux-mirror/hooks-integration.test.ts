import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface HookEntry {
  command?: string;
  args?: string[];
  timeout?: number;
}

interface HookGroup {
  matcher?: string;
  hooks?: HookEntry[];
}

/** Check if a hook references sync-once.mjs (works for both command and args formats) */
function isSyncOnce(h: HookEntry): boolean {
  if (h.args) return h.args.some((a) => a.includes("sync-once.mjs"));
  return h.command?.includes("sync-once.mjs") ?? false;
}

describe("hooks.json: sync-once entries (R2.7)", () => {
  const hooksPath = join(process.cwd(), "hooks", "hooks.json");

  function parseHooks() {
    const raw = readFileSync(hooksPath, "utf-8");
    return JSON.parse(raw) as { hooks: Record<string, HookGroup[]> };
  }

  it("hooks.json is valid JSON", () => {
    const parsed = parseHooks();
    expect(parsed.hooks).toBeDefined();
  });

  it("UserPromptSubmit contains sync-once entry", () => {
    const parsed = parseHooks();
    const entries = parsed.hooks.UserPromptSubmit;
    const hasSyncOnce = entries.some((e) => e.hooks?.some(isSyncOnce));
    expect(hasSyncOnce).toBe(true);
  });

  it("PostToolUse(Write|Edit) contains sync-once entry", () => {
    const parsed = parseHooks();
    const entries = parsed.hooks.PostToolUse;
    const syncOnceEntries = entries.filter((e) => e.hooks?.some(isSyncOnce));
    expect(syncOnceEntries.length).toBeGreaterThanOrEqual(1);

    // Check it has matcher for Write|Edit
    const withMatcher = entries.find(
      (e) => (e as { matcher?: string }).matcher === "Write|Edit" && e.hooks?.some(isSyncOnce),
    );
    expect(withMatcher).toBeDefined();
  });

  it("Stop contains sync-once entry", () => {
    const parsed = parseHooks();
    const entries = parsed.hooks.Stop;
    const hasSyncOnce = entries.some((e) => e.hooks?.some(isSyncOnce));
    expect(hasSyncOnce).toBe(true);
  });

  it("sync-once entries have timeout set", () => {
    const parsed = parseHooks();
    const allHooks = Object.values(parsed.hooks)
      .flat()
      .flatMap((e) => e.hooks ?? []);

    const syncOnceHooks = allHooks.filter(isSyncOnce);
    for (const h of syncOnceHooks) {
      expect(h.timeout).toBeDefined();
      expect(h.timeout).toBeGreaterThan(0);
    }
  });

  it("sync-once args[] entries reference correct script", () => {
    const parsed = parseHooks();
    const allHooks = Object.values(parsed.hooks)
      .flat()
      .flatMap((e) => e.hooks ?? []);

    const syncOnceArgsHooks = allHooks.filter((h) => h.args && isSyncOnce(h));
    for (const h of syncOnceArgsHooks) {
      expect(h.args).toContain("scripts/cmux-mirror/sync-once.mjs");
      expect(h.args).toContain(".tinkerman");
    }
  });
});
