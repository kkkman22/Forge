import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "../..");

describe("Config foundation (R6 + R7 + config fields)", () => {
  describe(".tinkerman/config.md", () => {
    const configPath = resolve(ROOT, ".tinkerman/config.md");
    const content = existsSync(configPath) ? readFileSync(configPath, "utf-8") : "";

    const requiredFields: Array<{ field: string; expected: string }> = [
      { field: "review_dispatch_mode", expected: "inline" },
      { field: "decide_dispatch_mode", expected: "auto" },
      { field: "output_conciseness_hook", expected: "on" },
      { field: "forge_compact_restate_reminder", expected: "on" },
      { field: "forge_compact_restate_threshold_tasks", expected: "3" },
      { field: "postooluse_inject_warnings", expected: "on" },
      { field: "review_use_ultrareview", expected: "true" },
    ];

    it.each(requiredFields)("has field $field = $expected", ({ field, expected }) => {
      const pattern = new RegExp(`^\\s*${field}:\\s*${expected}`, "m");
      expect(content).toMatch(pattern);
    });
  });

  describe(".claude/settings.json", () => {
    const settingsPath = resolve(ROOT, ".claude/settings.json");
    const content = existsSync(settingsPath) ? readFileSync(settingsPath, "utf-8") : "{}";
    const settings = JSON.parse(content);

    it("has autoMode.hard_deny array", () => {
      expect(settings.autoMode).toBeDefined();
      expect(Array.isArray(settings.autoMode.hard_deny)).toBe(true);
      expect(settings.autoMode.hard_deny.length).toBeGreaterThan(0);
    });

    it("has worktree.baseRef set to fresh", () => {
      expect(settings.worktree).toBeDefined();
      expect(settings.worktree.baseRef).toBe("fresh");
    });

    it("hard_deny includes main/master branch Edit/Write rule", () => {
      const rules = settings.autoMode.hard_deny;
      const hasBranchProtection = rules.some(
        (r: string | object) =>
          typeof r === "string" && (r.includes("Edit") || r.includes("Write")),
      );
      expect(hasBranchProtection).toBe(true);
    });
  });
});
