import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateTopic } from "../../src/forge-dispatcher/allowlist.js";

const ROOT = resolve(__dirname, "../..");

describe("Charter Contract", () => {
  it("dispatcher accepts charter as valid subcommand", () => {
    const result = validateTopic("charter");
    expect(result).toEqual({ ok: true, value: "charter" });
  });

  it("charter template exists with required sections", () => {
    const path = resolve(ROOT, "templates/charter-template.md");
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, "utf-8");
    const requiredSections = ["核心问题", "架构边界", "技术选型基线", "不可变量", "变更日志"];
    for (const section of requiredSections) {
      expect(content, `missing section: ${section}`).toContain(section);
    }
    expect(content).toContain("INV-");
  });

  it("charter skill exists with all 4 subcommands", () => {
    const path = resolve(ROOT, "skills/tinkerman/lib/charter/instructions.md");
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, "utf-8");
    for (const sub of ["init", "update", "check", "show"]) {
      expect(content, `missing subcommand: ${sub}`).toContain(sub);
    }
  });

  it("SKILL.md lists charter in Auxiliary", () => {
    const path = resolve(ROOT, "skills/tinkerman/SKILL.md");
    const content = readFileSync(path, "utf-8");
    expect(content).toContain("charter");
  });

  it("spec-check agent includes charter compliance", () => {
    const path = resolve(ROOT, ".claude/agents/spec-check.md");
    expect(existsSync(path)).toBe(true);
    const content = readFileSync(path, "utf-8");
    expect(content).toContain("Charter Compliance");
  });

  it("spec skill includes charter compliance section", () => {
    const path = resolve(ROOT, "skills/tinkerman/lib/spec/instructions.md");
    const content = readFileSync(path, "utf-8");
    expect(content).toMatch(/charter/i);
  });

  it("plan skill includes charter boundary check", () => {
    const path = resolve(ROOT, "skills/tinkerman/lib/plan/instructions.md");
    const content = readFileSync(path, "utf-8");
    expect(content).toMatch(/charter/i);
  });

  it("learn skill includes charter_refs", () => {
    const path = resolve(ROOT, "skills/tinkerman/lib/learn/instructions.md");
    const content = readFileSync(path, "utf-8");
    expect(content).toContain("charter_refs");
  });

  it("init skill includes charter option", () => {
    const path = resolve(ROOT, "skills/tinkerman/lib/init/instructions.md");
    const content = readFileSync(path, "utf-8");
    expect(content).toMatch(/charter/i);
  });
});
