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
const libDir = resolve(ROOT, "skills", "tinkerman", "lib");

// Discover all sub-skill directories under collapsed lib structure
const subSkillDirs = readdirSync(libDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

// Collect all instructions.md files that exist
const instrFiles = subSkillDirs
  .map((dir) => ({ dir, path: resolve(libDir, dir, "instructions.md") }))
  .filter(({ path: p }) => existsSync(p));

// ---------------------------------------------------------------------------
// Req 8.4: Each SKILL.md exists and has required structural sections
// ---------------------------------------------------------------------------

describe("Contract: skills/tinkerman/lib/*/instructions.md structural validation", () => {
  it("at least one sub-skill directory exists", () => {
    expect(subSkillDirs.length).toBeGreaterThan(0);
  });

  for (const dir of subSkillDirs) {
    it(`skills/tinkerman/lib/${dir}/instructions.md exists`, () => {
      const skillPath = resolve(libDir, dir, "instructions.md");
      expect(existsSync(skillPath), `Missing: skills/tinkerman/lib/${dir}/instructions.md`).toBe(
        true,
      );
    });
  }
});

describe("Contract: skills/tinkerman/lib/*/instructions.md has YAML frontmatter", () => {
  for (const { dir, path: skillPath } of instrFiles) {
    it(`skills/tinkerman/lib/${dir}/instructions.md starts with YAML frontmatter`, () => {
      const content = readFileSync(skillPath, "utf-8");
      expect(
        content.startsWith("---\n"),
        `skills/tinkerman/lib/${dir}/instructions.md missing opening frontmatter delimiter`,
      ).toBe(true);

      const closingIdx = content.indexOf("---", 4);
      expect(
        closingIdx,
        `skills/tinkerman/lib/${dir}/instructions.md missing closing frontmatter delimiter`,
      ).toBeGreaterThan(0);
    });

    it(`skills/tinkerman/lib/${dir}/instructions.md frontmatter contains 'description' or 'name' field`, () => {
      const content = readFileSync(skillPath, "utf-8");
      const closingIdx = content.indexOf("---", 4);
      const frontmatter = content.slice(4, closingIdx);
      expect(frontmatter).toMatch(/^(?:name|description):\s+/m);
    });

    it(`skills/tinkerman/lib/${dir}/instructions.md frontmatter contains 'description' field`, () => {
      const content = readFileSync(skillPath, "utf-8");
      const closingIdx = content.indexOf("---", 4);
      const frontmatter = content.slice(4, closingIdx);
      expect(frontmatter).toMatch(/^description:\s+/m);
    });
  }
});

describe("Contract: skills/tinkerman/lib/*/instructions.md contains required content sections", () => {
  for (const { dir, path: skillPath } of instrFiles) {
    it(`skills/tinkerman/lib/${dir}/instructions.md has substantive content after frontmatter`, () => {
      const content = readFileSync(skillPath, "utf-8");
      const frontmatterEnd = content.indexOf("---", content.indexOf("---") + 3);
      expect(
        frontmatterEnd,
        `skills/tinkerman/lib/${dir}/instructions.md has no closing frontmatter delimiter`,
      ).toBeGreaterThan(0);

      const bodyContent = content.slice(frontmatterEnd + 3).trim();
      expect(
        bodyContent.length,
        `skills/tinkerman/lib/${dir}/instructions.md has no content after frontmatter`,
      ).toBeGreaterThan(0);
    });

    it(`skills/tinkerman/lib/${dir}/instructions.md has a heading structure (## sections)`, () => {
      const content = readFileSync(skillPath, "utf-8");
      const frontmatterEnd = content.indexOf("---", content.indexOf("---") + 3);
      const bodyContent = content.slice(frontmatterEnd + 3);

      const hasHeadings = /^##\s+/m.test(bodyContent);
      expect(
        hasHeadings,
        `skills/tinkerman/lib/${dir}/instructions.md has no ## section headings after frontmatter`,
      ).toBe(true);
    });

    it(`skills/tinkerman/lib/${dir}/instructions.md has an overview or instructions section`, () => {
      const content = readFileSync(skillPath, "utf-8");
      const frontmatterEnd = content.indexOf("---", content.indexOf("---") + 3);
      const bodyContent = content.slice(frontmatterEnd + 3);

      const instructionsPattern = /^##\s+(Instructions|指令|概述|\d+[.\s])/m;
      expect(
        instructionsPattern.test(bodyContent),
        `skills/tinkerman/lib/${dir}/instructions.md has no overview/instructions section (expected ## Instructions, ## 概述, or numbered ## heading)`,
      ).toBe(true);
    });
  }
});

// ---------------------------------------------------------------------------
// Contract: forge-resume SKILL.md --from-pr feature
// ---------------------------------------------------------------------------

describe("Contract: forge-resume SKILL.md --from-pr feature", () => {
  const resumeSkillPath = resolve(ROOT, "skills", "tinkerman", "lib", "resume", "instructions.md");

  it("forge-resume SKILL.md contains '从 PR 恢复' section", () => {
    expect(
      existsSync(resumeSkillPath),
      "Missing: skills/tinkerman/lib/resume/instructions.md",
    ).toBe(true);
    const content = readFileSync(resumeSkillPath, "utf-8");
    expect(content).toContain("从 PR 恢复");
    expect(content).toMatch(/##\s+5\.\s+从 PR 恢复|--from-pr/);
  });

  it("forge-resume SKILL.md documents --from-pr flag", () => {
    const content = readFileSync(resumeSkillPath, "utf-8");
    expect(content).toContain("--from-pr");
    expect(content).toContain("scripts/resume-from-pr.mjs");
  });

  it("forge-resume SKILL.md documents mutual exclusion with --spec", () => {
    const content = readFileSync(resumeSkillPath, "utf-8");
    expect(content).toMatch(/--from-pr.*--spec.*互斥|互斥.*--from-pr.*--spec/);
  });

  it("forge-resume SKILL.md stays within 150 lines", () => {
    const content = readFileSync(resumeSkillPath, "utf-8");
    const lineCount = content.split("\n").length;
    expect(lineCount).toBeLessThanOrEqual(150);
  });
});

// ---------------------------------------------------------------------------
// UltraReview CI awareness in forge-review

describe("Contract: forge-review SKILL CI awareness", () => {
  const skillPath = resolve(ROOT, "skills", "tinkerman", "lib", "review", "instructions.md");
  const content = readFileSync(skillPath, "utf-8");

  it("contains CI evidence intake section", () => {
    expect(content, "forge-review SKILL.md missing CI evidence intake section").toContain(
      "CI 证据接入",
    );
  });

  it("contains confirmed-by-ci prefix rule", () => {
    expect(content, "forge-review SKILL.md missing [confirmed-by-ci] prefix rule").toContain(
      "[confirmed-by-ci]",
    );
  });

  it("declares CI artifacts read-only", () => {
    expect(content, "forge-review SKILL.md missing CI artifact read-only declaration").toMatch(
      /ci.*\.md.*(?:只读|不得.*修改)/i,
    );
  });
});
