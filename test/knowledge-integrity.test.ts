import { describe, expect, it } from "vitest";
import {
  checkContradictions,
  checkOrphanSolutions,
  checkReferenceIntegrity,
  type IntegrityInput,
  lintKnowledgeIntegrity,
} from "../src/knowledge-integrity.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<IntegrityInput> = {}): IntegrityInput {
  return {
    instinctsContent: overrides.instinctsContent ?? "",
    evolvedRulesContent: overrides.evolvedRulesContent ?? "",
    knownFailuresContent: overrides.knownFailuresContent ?? "",
    solutions: overrides.solutions ?? new Map(),
    sessionFiles: overrides.sessionFiles ?? [],
  };
}

// ---------------------------------------------------------------------------
// checkReferenceIntegrity
// ---------------------------------------------------------------------------

describe("checkReferenceIntegrity", () => {
  it("reports no findings when all references resolve", () => {
    const input = makeInput({
      instinctsContent: `### Pattern A

**Confidence_Score**: 0.8
**Tags**: git, security
**来源**: ship-delivery-pure-functions

Body text.
`,
      solutions: new Map([["ship-delivery-pure-functions", "---\ntitle: Test\n---\n"]]),
    });
    const findings = checkReferenceIntegrity(input);
    expect(findings).toHaveLength(0);
  });

  it("reports broken reference when source does not match any solution", () => {
    const input = makeInput({
      instinctsContent: `### Pattern A

**Confidence_Score**: 0.8
**Tags**: git
**来源**: nonexistent-document

Body text.
`,
      solutions: new Map([["ship-delivery", "---\ntitle: Test\n---\n"]]),
      sessionFiles: [],
    });
    const findings = checkReferenceIntegrity(input);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].category).toBe("broken-reference");
    expect(findings[0].file).toBe("instincts.md");
    expect(findings[0].detail).toBe("nonexistent-document");
  });

  it("resolves references via partial match", () => {
    const input = makeInput({
      instinctsContent: `### Pattern A

**来源**: hooks-security

Body.
`,
      solutions: new Map([["hooks-security-sanitization", "---\ntitle: T\n---\n"]]),
    });
    const findings = checkReferenceIntegrity(input);
    expect(findings).toHaveLength(0);
  });

  it("resolves references to session files", () => {
    const input = makeInput({
      instinctsContent: `### Pattern A

**来源**: ccbp-phase2-worktree-gitignore

Body.
`,
      solutions: new Map(),
      sessionFiles: ["2026-05-12-ccbp-phase2-worktree-gitignore.md"],
    });
    const findings = checkReferenceIntegrity(input);
    expect(findings).toHaveLength(0);
  });

  it("reports broken evolved-rules Source references", () => {
    const input = makeInput({
      evolvedRulesContent: `### R3: Some Rule

**Content**: Rule content
**Prevents**: Something
**Source**: .tinkerman/knowledge/glm-summary-ending.md
**Added**: 2026-05-09
**Confidence**: 0.9
`,
      solutions: new Map([["ship-delivery", ""]]),
      sessionFiles: [],
    });
    const findings = checkReferenceIntegrity(input);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].category).toBe("broken-reference");
    expect(findings[0].file).toBe("evolved-rules.md");
  });

  it("accepts user-facing description sources (contains —)", () => {
    const input = makeInput({
      instinctsContent: `### Pattern A

**来源**: 用户反馈 — spec 阶段自检完成后模型直接 idle

Body.
`,
      solutions: new Map(),
    });
    const findings = checkReferenceIntegrity(input);
    expect(findings).toHaveLength(0);
  });

  it("handles comma-separated sources", () => {
    const input = makeInput({
      instinctsContent: `### Pattern A

**来源**: hooks-security-sanitization, ccbp-phase2-worktree-gitignore

Body.
`,
      solutions: new Map([["hooks-security-sanitization", ""]]),
      sessionFiles: ["2026-05-12-ccbp-phase2-worktree-gitignore.md"],
    });
    const findings = checkReferenceIntegrity(input);
    expect(findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// checkOrphanSolutions
// ---------------------------------------------------------------------------

describe("checkOrphanSolutions", () => {
  it("reports solutions not referenced by any instinct or rule", () => {
    const input = makeInput({
      instinctsContent: `### Pattern A

**来源**: referenced-doc

Body.
`,
      solutions: new Map([
        ["referenced-doc", ""],
        ["orphan-doc", ""],
      ]),
    });
    const findings = checkOrphanSolutions(input);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe("orphan-solution");
    expect(findings[0].detail).toBe("orphan-doc");
  });

  it("reports no orphans when all solutions are referenced", () => {
    const input = makeInput({
      instinctsContent: `### Pattern A

**来源**: doc-a

Body.
`,
      evolvedRulesContent: `### R1: Rule

**Source**: doc-b
`,
      solutions: new Map([
        ["doc-a", ""],
        ["doc-b", ""],
      ]),
    });
    const findings = checkOrphanSolutions(input);
    expect(findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// checkContradictions
// ---------------------------------------------------------------------------

describe("checkContradictions", () => {
  it("detects contradiction between patterns with overlapping tags and opposing polarity", () => {
    const input = makeInput({
      instinctsContent: `### Always use inline regex

**Tags**: regex, testing
**来源**: doc-a

You should always use inline regex. Must prefer /pattern/.test(). Recommend this approach.

### Never use inline regex

**Tags**: regex, testing
**来源**: doc-b

You should never use inline regex. Avoid this pattern. Don't do it. 禁止使用.
`,
    });
    const findings = checkContradictions(input);
    expect(findings.length).toBeGreaterThan(0);
    expect(findings[0].category).toBe("contradiction");
  });

  it("does not flag patterns with low tag overlap", () => {
    const input = makeInput({
      instinctsContent: `### Always use X

**Tags**: security, git, hooks
**来源**: doc-a

Always use X. Must prefer X. Recommend X.

### Never use Y

**Tags**: testing, regex, performance
**来源**: doc-b

Never use Y. Avoid Y. Don't use Y. 禁止 Y.
`,
    });
    const findings = checkContradictions(input);
    expect(findings).toHaveLength(0);
  });

  it("does not flag patterns with same polarity", () => {
    const input = makeInput({
      instinctsContent: `### Always use X

**Tags**: security, git
**来源**: doc-a

Always use X. Must prefer X. Recommend X.

### Always use Y

**Tags**: security, git
**来源**: doc-b

Always use Y. Must prefer Y. Recommend Y.
`,
    });
    const findings = checkContradictions(input);
    expect(findings).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// lintKnowledgeIntegrity (integration)
// ---------------------------------------------------------------------------

describe("lintKnowledgeIntegrity", () => {
  it("combines all checks", () => {
    const input = makeInput({
      instinctsContent: `### Pattern A

**Tags**: git
**来源**: missing-source

Body.
`,
      solutions: new Map([["orphan-doc", ""]]),
    });
    const findings = lintKnowledgeIntegrity(input);
    // Should have at least: broken-reference + orphan-solution
    const categories = findings.map((f) => f.category);
    expect(categories).toContain("broken-reference");
    expect(categories).toContain("orphan-solution");
  });

  it("returns empty for healthy knowledge base", () => {
    const input = makeInput({
      instinctsContent: `### Pattern A

**Tags**: git
**来源**: my-solution

Always use git add -f. Must remember. Recommend this.
`,
      evolvedRulesContent: `### R1: Rule

**Source**: my-solution
**Confidence**: 0.9
`,
      solutions: new Map([["my-solution", ""]]),
    });
    const findings = lintKnowledgeIntegrity(input);
    expect(findings).toHaveLength(0);
  });
});
