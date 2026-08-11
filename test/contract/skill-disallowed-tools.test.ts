/**
 * Contract tests — skill disallowed-tools matrix (R3).
 *
 * Validates that every forge agent / skill instruction file
 * carries a `disallowedTools` frontmatter field whose value
 * matches the matrix defined in ADR 2026-05-28-skill-disallowed-tools-matrix.md.
 *
 * Covers:
 *   - Each agent .md file has valid YAML frontmatter with `disallowedTools`
 *   - forge-review disallows Edit, Write, MultiEdit
 *   - forge-decide-* agents disallow Edit, Write
 *   - forge-plan disallows Edit, Write, MultiEdit
 *   - forge-ship disallows destructive Bash commands
 *   - forge-learn disallows git push
 *   - Matrix ADR file exists
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse YAML frontmatter from a markdown file. Returns the text between --- markers. */
function parseFrontmatter(filePath: string): string {
  const content = readFileSync(filePath, "utf-8");
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return "";
  }
  return match[1];
}

/** Extract the disallowedTools value from frontmatter text. Returns parsed array or null. */
function getDisallowedTools(frontmatter: string): string[] | null {
  // Match both array literal [A, B] and multiline list
  const match = frontmatter.match(
    /disallowedTools:\s*\[([^\]]*)\]|disallowedTools:\s*\n((?:\s*-\s+.*\n?)+)/,
  );
  if (!match) return null;

  const raw = match[1] ?? match[2];
  if (!raw) return null;

  // Parse inline array: [Edit, Write, MultiEdit]
  if (match[1] !== undefined) {
    return match[1]
      .split(",")
      .map((s) => s.trim().replace(/['"]/g, ""))
      .filter(Boolean);
  }

  // Parse multiline list: - Edit\n- Write
  return raw
    .split("\n")
    .map((line) => line.replace(/^\s*-\s*/, "").trim())
    .filter(Boolean);
}

/** Check that a disallowedTools array contains a given tool or pattern. */
function disallowedIncludes(tools: string[] | null, pattern: string): boolean {
  if (!tools) return false;
  return tools.some((t) => t === pattern || t.includes(pattern));
}

// ---------------------------------------------------------------------------
// Matrix definition — maps agent file to expected disallowed tools
// ---------------------------------------------------------------------------

interface AgentToolExpectation {
  /** Path relative to ROOT */
  file: string;
  /** Tool names/patterns that MUST appear in disallowedTools */
  mustInclude: string[];
  /** Human-readable description of the agent */
  label: string;
}

const AGENT_EXPECTATIONS: AgentToolExpectation[] = [
  {
    file: ".claude/agents/forge-review.md",
    label: "forge-review",
    mustInclude: ["Edit", "Write", "MultiEdit", "NotebookEdit"],
  },
  {
    file: ".claude/agents/forge-decide-arch.md",
    label: "forge-decide-arch",
    mustInclude: ["Edit", "Write"],
  },
  {
    file: ".claude/agents/forge-decide-cost.md",
    label: "forge-decide-cost",
    mustInclude: ["Edit", "Write"],
  },
  {
    file: ".claude/agents/forge-decide-ops.md",
    label: "forge-decide-ops",
    mustInclude: ["Edit", "Write"],
  },
  {
    file: ".claude/agents/forge-decide-product.md",
    label: "forge-decide-product",
    mustInclude: ["Edit", "Write"],
  },
  {
    file: ".claude/agents/forge-decide-sec.md",
    label: "forge-decide-sec",
    mustInclude: ["Edit", "Write"],
  },
  {
    file: ".claude/agents/forge-plan.md",
    label: "forge-plan",
    mustInclude: ["Edit", "Write", "MultiEdit"],
  },
  {
    file: ".claude/agents/forge-ship.md",
    label: "forge-ship",
    mustInclude: ["Bash(rm -rf", "Bash(git reset --hard"],
  },
];

const LEARN_INSTRUCTIONS = "skills/tinkerman/lib/learn/instructions.md";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Contract: skill disallowed-tools matrix (R3)", () => {
  // --- ADR existence ---

  it("matrix ADR file exists", () => {
    const adrPath = resolve(
      ROOT,
      ".tinkerman/decisions/2026-05-28-skill-disallowed-tools-matrix.md",
    );
    expect(
      existsSync(adrPath),
      "Missing ADR: .tinkerman/decisions/2026-05-28-skill-disallowed-tools-matrix.md",
    ).toBe(true);
  });

  // --- Per-agent frontmatter and tool restrictions ---

  describe.each(AGENT_EXPECTATIONS)("$label agent", ({ file, label, mustInclude }) => {
    const fullPath = resolve(ROOT, file);

    it(`${file} exists`, () => {
      expect(existsSync(fullPath), `Missing agent file: ${file}`).toBe(true);
    });

    it(`${label} has valid YAML frontmatter`, () => {
      const frontmatter = parseFrontmatter(fullPath);
      expect(frontmatter.length, `${label} has empty or missing frontmatter`).toBeGreaterThan(0);
    });

    it(`${label} has disallowedTools field`, () => {
      const frontmatter = parseFrontmatter(fullPath);
      const tools = getDisallowedTools(frontmatter);
      expect(tools, `${label} missing disallowedTools field`).not.toBeNull();
    });

    for (const tool of mustInclude) {
      it(`${label} disallows ${tool}`, () => {
        const frontmatter = parseFrontmatter(fullPath);
        const tools = getDisallowedTools(frontmatter);
        expect(
          disallowedIncludes(tools, tool),
          `${label} should disallow ${tool}, got: ${JSON.stringify(tools)}`,
        ).toBe(true);
      });
    }
  });

  // --- forge-learn (skill instructions, not agent file) ---

  describe("forge-learn skill instructions", () => {
    const fullPath = resolve(ROOT, LEARN_INSTRUCTIONS);

    it(`${LEARN_INSTRUCTIONS} exists`, () => {
      expect(existsSync(fullPath), `Missing: ${LEARN_INSTRUCTIONS}`).toBe(true);
    });

    it("forge-learn has valid YAML frontmatter", () => {
      const frontmatter = parseFrontmatter(fullPath);
      expect(frontmatter.length, "forge-learn has empty or missing frontmatter").toBeGreaterThan(0);
    });

    it("forge-learn has disallowedTools field", () => {
      const frontmatter = parseFrontmatter(fullPath);
      const tools = getDisallowedTools(frontmatter);
      expect(tools, "forge-learn missing disallowedTools field").not.toBeNull();
    });

    it("forge-learn disallows Bash(git push *)", () => {
      const frontmatter = parseFrontmatter(fullPath);
      const tools = getDisallowedTools(frontmatter);
      expect(
        disallowedIncludes(tools, "Bash(git push"),
        `forge-learn should disallow Bash(git push *), got: ${JSON.stringify(tools)}`,
      ).toBe(true);
    });
  });

  // --- forge-review specific: git operations ---

  describe("forge-review git operation restrictions", () => {
    const fullPath = resolve(ROOT, ".claude/agents/forge-review.md");

    it("forge-review disallows Bash(git push *)", () => {
      const frontmatter = parseFrontmatter(fullPath);
      const tools = getDisallowedTools(frontmatter);
      expect(
        disallowedIncludes(tools, "Bash(git push"),
        "forge-review should disallow git push",
      ).toBe(true);
    });

    it("forge-review disallows Bash(git commit *)", () => {
      const frontmatter = parseFrontmatter(fullPath);
      const tools = getDisallowedTools(frontmatter);
      expect(
        disallowedIncludes(tools, "Bash(git commit"),
        "forge-review should disallow git commit",
      ).toBe(true);
    });

    it("forge-review disallows Bash(git reset *)", () => {
      const frontmatter = parseFrontmatter(fullPath);
      const tools = getDisallowedTools(frontmatter);
      expect(
        disallowedIncludes(tools, "Bash(git reset"),
        "forge-review should disallow git reset",
      ).toBe(true);
    });
  });

  // --- forge-plan specific: git push ---

  describe("forge-plan git push restriction", () => {
    const fullPath = resolve(ROOT, ".claude/agents/forge-plan.md");

    it("forge-plan disallows Bash(git push *)", () => {
      const frontmatter = parseFrontmatter(fullPath);
      const tools = getDisallowedTools(frontmatter);
      expect(
        disallowedIncludes(tools, "Bash(git push"),
        "forge-plan should disallow git push",
      ).toBe(true);
    });
  });
});
