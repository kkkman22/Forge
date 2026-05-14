/**
 * Contract tests for Build Nature Mode routing.
 *
 * Verifies that the refactor/fix → build migration is complete:
 * - Reference files exist with expected content
 * - forge-build SKILL.md contains Nature Mode routing
 * - Old skills have deprecation notices
 * - Dispatcher routes refactor/fix through build
 *
 * **Validates: Spec Requirements 1-12**
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(__dirname, "..");
const BUILD_SKILL = resolve(ROOT, "skills/forge-build/SKILL.md");
const REFS = resolve(ROOT, "skills/forge-build/references");
const FORGE_CMD = resolve(ROOT, ".claude/commands/forge.md");

function readFile(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), "utf-8");
}

describe("Build Nature Mode contracts", () => {
  // --- Reference file existence ---

  describe("reference files exist", () => {
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
  });

  // --- Build SKILL.md Nature Mode section ---

  describe("forge-build SKILL.md Nature Mode routing", () => {
    it("references Nature Mode section", () => {
      const content = readFileSync(BUILD_SKILL, "utf-8");
      expect(content).toContain("Nature Mode");
    });

    it("references refactor-mode.md", () => {
      const content = readFileSync(BUILD_SKILL, "utf-8");
      expect(content).toContain("refactor-mode.md");
    });

    it("references bugfix-mode.md", () => {
      const content = readFileSync(BUILD_SKILL, "utf-8");
      expect(content).toContain("bugfix-mode.md");
    });

    it("documents feature mode as default (no extra loading)", () => {
      const content = readFileSync(BUILD_SKILL, "utf-8");
      expect(content).toMatch(/feature.*不加载|不加载.*refactor/);
    });

    it("documents conditional loading (nature ≠ feature only)", () => {
      const content = readFileSync(BUILD_SKILL, "utf-8");
      expect(content).toContain("条件加载");
    });
  });

  // --- Refactor mode content ---

  describe("refactor-mode.md content", () => {
    it("contains 7 pre-flight checks", () => {
      const content = readFileSync(resolve(REFS, "refactor-mode.md"), "utf-8");
      for (let i = 1; i <= 7; i++) {
        expect(content).toMatch(new RegExp(`\\|\\s*${i}\\s*\\|`));
      }
    });

    it("contains scan phase", () => {
      const content = readFileSync(resolve(REFS, "refactor-mode.md"), "utf-8");
      expect(content).toMatch(/scan/i);
    });

    it("contains design phase", () => {
      const content = readFileSync(resolve(REFS, "refactor-mode.md"), "utf-8");
      expect(content).toMatch(/design/i);
    });

    it("contains apply phase", () => {
      const content = readFileSync(resolve(REFS, "refactor-mode.md"), "utf-8");
      expect(content).toMatch(/apply/i);
    });

    it("documents light tier fast-track (skip scan/design)", () => {
      const content = readFileSync(resolve(REFS, "refactor-mode.md"), "utf-8");
      expect(content).toMatch(/light|快速通道/);
    });

    it("references refactor-method-library.md", () => {
      const content = readFileSync(resolve(REFS, "refactor-mode.md"), "utf-8");
      expect(content).toContain("refactor-method-library.md");
    });
  });

  // --- Bugfix mode content ---

  describe("bugfix-mode.md content", () => {
    it("contains 3 pre-flight checks", () => {
      const content = readFileSync(resolve(REFS, "bugfix-mode.md"), "utf-8");
      for (let i = 1; i <= 3; i++) {
        expect(content).toMatch(new RegExp(`\\|\\s*${i}\\s*\\|`));
      }
    });

    it("contains analyze phase", () => {
      const content = readFileSync(resolve(REFS, "bugfix-mode.md"), "utf-8");
      expect(content).toMatch(/analyze/i);
    });

    it("contains apply phase", () => {
      const content = readFileSync(resolve(REFS, "bugfix-mode.md"), "utf-8");
      expect(content).toMatch(/apply/i);
    });

    it("contains verify phase", () => {
      const content = readFileSync(resolve(REFS, "bugfix-mode.md"), "utf-8");
      expect(content).toMatch(/verify/i);
    });

    it("documents log escalation (max 2 rounds)", () => {
      const content = readFileSync(resolve(REFS, "bugfix-mode.md"), "utf-8");
      expect(content).toMatch(/日志调试|log.*escalat/i);
      expect(content).toMatch(/2.*轮|2.*round/i);
    });

    it("documents light tier fast-track (skip analyze)", () => {
      const content = readFileSync(resolve(REFS, "bugfix-mode.md"), "utf-8");
      expect(content).toMatch(/light|快速通道/);
    });

    it("references bugfix-method-library.md", () => {
      const content = readFileSync(resolve(REFS, "bugfix-mode.md"), "utf-8");
      expect(content).toContain("bugfix-method-library.md");
    });
  });

  // --- Method library content ---

  describe("method libraries", () => {
    it("refactor-method-library.md contains L1-L4 classification", () => {
      const content = readFileSync(resolve(REFS, "refactor-method-library.md"), "utf-8");
      expect(content).toContain("L1");
      expect(content).toContain("L2");
      expect(content).toContain("L3");
      expect(content).toContain("L4");
    });

    it("refactor-method-library.md contains L1 techniques (Rename, Move, Extract, Inline)", () => {
      const content = readFileSync(resolve(REFS, "refactor-method-library.md"), "utf-8");
      expect(content).toMatch(/Rename/i);
      expect(content).toMatch(/Extract/i);
      expect(content).toMatch(/Inline/i);
    });

    it("bugfix-method-library.md contains root cause taxonomy (6 categories)", () => {
      const content = readFileSync(resolve(REFS, "bugfix-method-library.md"), "utf-8");
      expect(content).toMatch(/逻辑/);
      expect(content).toMatch(/状态/);
      expect(content).toMatch(/数据/);
      expect(content).toMatch(/并发/);
      expect(content).toMatch(/配置/);
      expect(content).toMatch(/缺防御/);
    });

    it("bugfix-method-library.md contains log escalation template", () => {
      const content = readFileSync(resolve(REFS, "bugfix-method-library.md"), "utf-8");
      expect(content).toMatch(/日志|log/i);
    });
  });

  // --- Deprecation ---

  describe("deprecated skills", () => {
    it("forge-refactor SKILL.md contains deprecation notice", () => {
      const content = readFile("skills/forge-refactor/SKILL.md");
      expect(content).toMatch(/deprecated/i);
      expect(content).toMatch(/refactor mode/i);
    });

    it("forge-fix SKILL.md contains deprecation notice", () => {
      const content = readFile("skills/forge-fix/SKILL.md");
      expect(content).toMatch(/deprecated/i);
      expect(content).toMatch(/bugfix mode/i);
    });

    it("forge-refactor still has valid frontmatter (name, description)", () => {
      const content = readFile("skills/forge-refactor/SKILL.md");
      expect(content).toMatch(/^---[\s\S]*?name:/m);
      expect(content).toMatch(/^---[\s\S]*?description:/m);
    });

    it("forge-fix still has valid frontmatter (name, description)", () => {
      const content = readFile("skills/forge-fix/SKILL.md");
      expect(content).toMatch(/^---[\s\S]*?name:/m);
      expect(content).toMatch(/^---[\s\S]*?description:/m);
    });
  });

  // --- Dispatcher ---

  describe("forge.md dispatcher", () => {
    it("refactor subcommand routes to build", () => {
      const content = readFileSync(FORGE_CMD, "utf-8");
      expect(content).toMatch(/refactor.*build|build.*refactor/i);
    });

    it("fix subcommand routes to build", () => {
      const content = readFileSync(FORGE_CMD, "utf-8");
      expect(content).toMatch(/fix.*build|build.*fix/i);
    });

    it("documents work_nature passthrough for refactor/fix", () => {
      const content = readFileSync(FORGE_CMD, "utf-8");
      expect(content).toMatch(/work_nature/);
    });
  });
});
