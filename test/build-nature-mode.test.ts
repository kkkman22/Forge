import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const BUILD_SKILL = "skills/tinkerman/lib/build/instructions.md";
const REFS = "skills/tinkerman/lib/build/references";

describe("Build Nature Mode contracts", () => {
  // --- Reference file existence ---

  it("refactor-mode.md exists in build references", () => {
    expect(existsSync(resolve(REFS, "refactor-mode.md"))).toBe(true);
  });

  it("bugfix-mode.md exists in build references", () => {
    expect(existsSync(resolve(REFS, "bugfix-mode.md"))).toBe(true);
  });

  it("refactor-method-library.md exists in build references", () => {
    expect(existsSync(resolve(REFS, "refactor-method-library.md"))).toBe(true);
  });

  it("bugfix-method-library.md exists in build references", () => {
    expect(existsSync(resolve(REFS, "bugfix-method-library.md"))).toBe(true);
  });

  // --- Build SKILL.md contains Nature Mode section ---

  it("forge-build SKILL.md references Nature Mode routing", () => {
    const content = readFileSync(BUILD_SKILL, "utf-8");
    expect(content).toContain("Nature Mode");
    expect(content).toContain("refactor-mode.md");
    expect(content).toContain("bugfix-mode.md");
  });

  // --- Refactor mode content ---

  it("refactor-mode.md contains 7 pre-flight checks", () => {
    const content = readFileSync(resolve(REFS, "refactor-mode.md"), "utf-8");
    for (let i = 1; i <= 7; i++) {
      expect(content).toMatch(new RegExp(`\\|\\s*${i}\\s*\\|`));
    }
  });

  it("refactor-mode.md contains scan/design/apply phases", () => {
    const content = readFileSync(resolve(REFS, "refactor-mode.md"), "utf-8");
    expect(content).toContain("scan");
    expect(content).toContain("design");
    expect(content).toContain("apply");
  });

  // --- Bugfix mode content ---

  it("bugfix-mode.md contains 3 pre-flight checks", () => {
    const content = readFileSync(resolve(REFS, "bugfix-mode.md"), "utf-8");
    for (let i = 1; i <= 3; i++) {
      expect(content).toMatch(new RegExp(`\\|\\s*${i}\\s*\\|`));
    }
  });

  it("bugfix-mode.md contains analyze/apply/verify phases", () => {
    const content = readFileSync(resolve(REFS, "bugfix-mode.md"), "utf-8");
    expect(content).toContain("analyze");
    expect(content).toContain("apply");
    expect(content).toContain("verify");
  });

  // --- Method library content ---

  it("refactor-method-library.md contains L1-L4 classification", () => {
    const content = readFileSync(resolve(REFS, "refactor-method-library.md"), "utf-8");
    expect(content).toContain("L1");
    expect(content).toContain("L2");
    expect(content).toContain("L3");
    expect(content).toContain("L4");
  });

  it("bugfix-method-library.md contains root cause taxonomy", () => {
    const content = readFileSync(resolve(REFS, "bugfix-method-library.md"), "utf-8");
    expect(content).toContain("逻辑");
    expect(content).toContain("状态");
    expect(content).toContain("数据");
  });

  // --- Deprecation ---

  it("forge-refactor SKILL.md contains deprecation notice", () => {
    const content = readFileSync("skills/tinkerman/lib/refactor/instructions.md", "utf-8");
    expect(content).toContain("deprecated");
    expect(content).toContain("refactor mode");
  });

  it("forge-fix SKILL.md references bugfix three-file workflow", () => {
    const content = readFileSync("skills/tinkerman/lib/fix/instructions.md", "utf-8");
    expect(content).toContain("runBugfixOrchestration");
    expect(content).toContain("detectSpecKind");
  });

  // --- Dispatcher ---

  it("tinkerman.md dispatcher routes refactor to build", () => {
    const content = readFileSync(".claude/commands/tinkerman.md", "utf-8");
    expect(content).toMatch(/refactor.*build/i);
  });

  it("tinkerman.md dispatcher routes fix to build", () => {
    const content = readFileSync(".claude/commands/tinkerman.md", "utf-8");
    expect(content).toMatch(/fix.*build/i);
  });
});
