import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

interface HookEntry {
  command?: string;
  timeout?: number;
}

interface HookGroup {
  matcher?: string;
  hooks?: HookEntry[];
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
    const hasSyncOnce = entries.some((e) =>
      e.hooks?.some((h) => h.command?.includes("sync-once.mjs")),
    );
    expect(hasSyncOnce).toBe(true);
  });

  it("PostToolUse(Write|Edit) contains sync-once entry", () => {
    const parsed = parseHooks();
    const entries = parsed.hooks.PostToolUse;
    const syncOnceEntries = entries.filter((e) =>
      e.hooks?.some((h) => h.command?.includes("sync-once.mjs")),
    );
    expect(syncOnceEntries.length).toBeGreaterThanOrEqual(1);

    // Check it has matcher for Write|Edit
    const withMatcher = entries.find(
      (e) =>
        (e as { matcher?: string }).matcher === "Write|Edit" &&
        e.hooks?.some((h) => h.command?.includes("sync-once.mjs")),
    );
    expect(withMatcher).toBeDefined();
  });

  it("Stop contains sync-once entry", () => {
    const parsed = parseHooks();
    const entries = parsed.hooks.Stop;
    const hasSyncOnce = entries.some((e) =>
      e.hooks?.some((h) => h.command?.includes("sync-once.mjs")),
    );
    expect(hasSyncOnce).toBe(true);
  });

  it("sync-once entries have timeout 2s", () => {
    const parsed = parseHooks();
    const allHooks = Object.values(parsed.hooks)
      .flat()
      .flatMap((e) => e.hooks ?? []);

    const syncOnceHooks = allHooks.filter((h) => h.command?.includes("sync-once.mjs"));
    for (const h of syncOnceHooks) {
      expect(h.timeout).toBe(2);
    }
  });

  it("sync-once entries use || true for failure tolerance", () => {
    const parsed = parseHooks();
    const allHooks = Object.values(parsed.hooks)
      .flat()
      .flatMap((e) => e.hooks ?? []);

    const syncOnceHooks = allHooks.filter((h) => h.command?.includes("sync-once.mjs"));
    for (const h of syncOnceHooks) {
      expect(h.command).toContain("|| true");
    }
  });
});
