/**
 * Contract tests for skills SKILL.md files - Peripheral Asset Validation (Req 8.4)
 *
 * Validates:
 *   1. All skill directories contain a SKILL.md file
 *   2. Each SKILL.md contains required structural sections
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");
const skillsDir = resolve(ROOT, "skills");

// Discover all skill directories (excluding shared/ which contains cross-cutting references)
const skillDirs = readdirSync(skillsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== "shared")
  .map((d) => d.name);

// Collect all SKILL.md files that exist
const skillMdFiles = skillDirs
  .map((dir) => ({ dir, path: resolve(skillsDir, dir, "SKILL.md") }))
  .filter(({ path: p }) => existsSync(p));

// ---------------------------------------------------------------------------
// Req 8.4: Each SKILL.md exists and has required structural sections
// ---------------------------------------------------------------------------

describe("Contract: skills/*/SKILL.md structural validation", () => {
  it("at least one skill directory exists", () => {
    expect(skillDirs.length).toBeGreaterThan(0);
  });

  for (const dir of skillDirs) {
    it(`skills/${dir}/SKILL.md exists`, () => {
      const skillPath = resolve(skillsDir, dir, "SKILL.md");
      expect(existsSync(skillPath), `Missing: skills/${dir}/SKILL.md`).toBe(true);
    });
  }
});

describe("Contract: skills/*/SKILL.md has YAML frontmatter", () => {
  for (const { dir, path: skillPath } of skillMdFiles) {
    it(`skills/${dir}/SKILL.md starts with YAML frontmatter`, () => {
      const content = readFileSync(skillPath, "utf-8");
      expect(
        content.startsWith("---\n"),
        `skills/${dir}/SKILL.md missing opening frontmatter delimiter`,
      ).toBe(true);

      const closingIdx = content.indexOf("---", 4);
      expect(
        closingIdx,
        `skills/${dir}/SKILL.md missing closing frontmatter delimiter`,
      ).toBeGreaterThan(0);
    });

    it(`skills/${dir}/SKILL.md frontmatter contains 'name' field`, () => {
      const content = readFileSync(skillPath, "utf-8");
      const closingIdx = content.indexOf("---", 4);
      const frontmatter = content.slice(4, closingIdx);
      expect(frontmatter).toMatch(/^name:\s+/m);
    });

    it(`skills/${dir}/SKILL.md frontmatter contains 'description' field`, () => {
      const content = readFileSync(skillPath, "utf-8");
      const closingIdx = content.indexOf("---", 4);
      const frontmatter = content.slice(4, closingIdx);
      expect(frontmatter).toMatch(/^description:\s+/m);
    });
  }
});

describe("Contract: skills/*/SKILL.md contains required content sections", () => {
  for (const { dir, path: skillPath } of skillMdFiles) {
    it(`skills/${dir}/SKILL.md has substantive content after frontmatter`, () => {
      const content = readFileSync(skillPath, "utf-8");
      const frontmatterEnd = content.indexOf("---", content.indexOf("---") + 3);
      expect(
        frontmatterEnd,
        `skills/${dir}/SKILL.md has no closing frontmatter delimiter`,
      ).toBeGreaterThan(0);

      const bodyContent = content.slice(frontmatterEnd + 3).trim();
      expect(
        bodyContent.length,
        `skills/${dir}/SKILL.md has no content after frontmatter`,
      ).toBeGreaterThan(0);
    });

    it(`skills/${dir}/SKILL.md has a heading structure (## sections)`, () => {
      const content = readFileSync(skillPath, "utf-8");
      const frontmatterEnd = content.indexOf("---", content.indexOf("---") + 3);
      const bodyContent = content.slice(frontmatterEnd + 3);

      // Each SKILL.md should have at least one ## heading indicating structured content
      // Common patterns: ## 1. 概述, ## Instructions, ## 触发条件, ## 输出规范
      const hasHeadings = /^##\s+/m.test(bodyContent);
      expect(
        hasHeadings,
        `skills/${dir}/SKILL.md has no ## section headings after frontmatter`,
      ).toBe(true);
    });

    it(`skills/${dir}/SKILL.md has an overview or instructions section`, () => {
      const content = readFileSync(skillPath, "utf-8");
      const frontmatterEnd = content.indexOf("---", content.indexOf("---") + 3);
      const bodyContent = content.slice(frontmatterEnd + 3);

      // Match ## Instructions, ## 指令, ## 概述, or any numbered ## heading (e.g. ## 1. 概述)
      const instructionsPattern = /^##\s+(Instructions|指令|概述|\d+[.\s])/m;
      expect(
        instructionsPattern.test(bodyContent),
        `skills/${dir}/SKILL.md has no overview/instructions section (expected ## Instructions, ## 概述, or numbered ## heading)`,
      ).toBe(true);
    });
  }
});
