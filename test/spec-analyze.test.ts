/**
 * T-06: Analyze Requirements pre-check tests.
 *
 * analyzeRequirements: 5 rules (ANL-01~05) with severity levels.
 *
 * Validates: Requirement 3
 */
import { describe, expect, it } from "vitest";
import { analyzeRequirements } from "../src/spec-analyze.js";
import type { RequirementsDocument, EarsClause, SpecFileFrontmatter } from "../src/spec-bundle.js";

function makeFrontmatter(): SpecFileFrontmatter {
  return { feature: "test", status: "draft", date: "2026-05-23", workflow_variant: "requirements-first" };
}

function makeEarsClause(overrides?: Partial<EarsClause>): EarsClause {
  return { line: 1, when: "条件", shall: "行为", raw: "当 条件 时 系统应当 行为", ...overrides };
}

function makeReqDoc(overrides?: Partial<RequirementsDocument>): RequirementsDocument {
  return {
    frontmatter: makeFrontmatter(),
    intro: "Intro",
    glossary: [],
    userStories: [{
      title: "R1",
      description: "Test requirement",
      earsCriteria: [makeEarsClause()],
    }],
    earsCriteria: [makeEarsClause()],
    nonFunctional: ["NFR"],
    outOfScope: ["Out"],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// ANL-01: EARS compliance
// ---------------------------------------------------------------------------

describe("ANL-01: EARS compliance", () => {
  it("passes when all criteria match EARS pattern", () => {
    const doc = makeReqDoc();
    const result = analyzeRequirements(doc);
    const anl01 = result.findings.find((f) => f.rule === "ANL-01");
    expect(anl01).toBeUndefined(); // No finding = pass
  });

  it("reports P1 when criteria don't match EARS", () => {
    const doc = makeReqDoc({
      earsCriteria: [{ line: 1, when: "", shall: "", raw: "Some non-EARS text" }],
      userStories: [{
        title: "R1",
        description: "",
        earsCriteria: [{ line: 1, when: "", shall: "", raw: "Some non-EARS text" }],
      }],
    });
    const result = analyzeRequirements(doc);
    const anl01 = result.findings.find((f) => f.rule === "ANL-01");
    expect(anl01).toBeDefined();
    expect(anl01!.severity).toBe("P1");
    expect(anl01!.line).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// ANL-02: Consistency
// ---------------------------------------------------------------------------

describe("ANL-02: Consistency", () => {
  it("passes when requirements are consistent", () => {
    const doc = makeReqDoc();
    const result = analyzeRequirements(doc);
    const anl02 = result.findings.find((f) => f.rule === "ANL-02");
    expect(anl02).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ANL-03: Ambiguity
// ---------------------------------------------------------------------------

describe("ANL-03: Ambiguity detection", () => {
  it("reports P2 when vague terms found", () => {
    const doc = makeReqDoc({
      earsCriteria: [makeEarsClause({ raw: "当 合适的时候 系统应当 适当的处理" })],
      userStories: [{
        title: "R1",
        description: "",
        earsCriteria: [makeEarsClause({ raw: "当 合适的时候 系统应当 适当的处理" })],
      }],
    });
    const result = analyzeRequirements(doc);
    const anl03 = result.findings.find((f) => f.rule === "ANL-03");
    expect(anl03).toBeDefined();
    expect(anl03!.severity).toBe("P2");
  });

  it("passes when no vague terms", () => {
    const doc = makeReqDoc();
    const result = analyzeRequirements(doc);
    const anl03 = result.findings.find((f) => f.rule === "ANL-03");
    expect(anl03).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ANL-04: Conflict detection
// ---------------------------------------------------------------------------

describe("ANL-04: Conflict detection", () => {
  it("reports P0 when contradictory EARS clauses found", () => {
    const doc = makeReqDoc({
      earsCriteria: [
        makeEarsClause({ when: "用户提交", shall: "返回成功", raw: "当 用户提交 时 系统应当 返回成功" }),
        makeEarsClause({ when: "用户提交", shall: "返回失败", raw: "当 用户提交 时 系统应当 返回失败" }),
      ],
      userStories: [{
        title: "R1",
        description: "",
        earsCriteria: [
          makeEarsClause({ when: "用户提交", shall: "返回成功", raw: "当 用户提交 时 系统应当 返回成功" }),
          makeEarsClause({ when: "用户提交", shall: "返回失败", raw: "当 用户提交 时 系统应当 返回失败" }),
        ],
      }],
    });
    const result = analyzeRequirements(doc);
    const anl04 = result.findings.find((f) => f.rule === "ANL-04");
    expect(anl04).toBeDefined();
    expect(anl04!.severity).toBe("P0");
  });

  it("passes when no conflicts", () => {
    const doc = makeReqDoc({
      earsCriteria: [
        makeEarsClause({ when: "用户提交", shall: "返回成功", raw: "..." }),
        makeEarsClause({ when: "用户取消", shall: "返回取消", raw: "..." }),
      ],
      userStories: [{
        title: "R1",
        description: "",
        earsCriteria: [
          makeEarsClause({ when: "用户提交", shall: "返回成功", raw: "..." }),
        ],
      }],
    });
    const result = analyzeRequirements(doc);
    const anl04 = result.findings.find((f) => f.rule === "ANL-04");
    expect(anl04).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// ANL-05: Completeness (missing sections)
// ---------------------------------------------------------------------------

describe("ANL-05: Completeness", () => {
  it("reports P0 when no requirements exist", () => {
    const doc = makeReqDoc({
      earsCriteria: [],
      userStories: [],
    });
    const result = analyzeRequirements(doc);
    const anl05 = result.findings.find((f) => f.rule === "ANL-05");
    expect(anl05).toBeDefined();
    expect(anl05!.severity).toBe("P0");
  });

  it("passes when requirements exist", () => {
    const doc = makeReqDoc();
    const result = analyzeRequirements(doc);
    const anl05 = result.findings.find((f) => f.rule === "ANL-05");
    expect(anl05).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Overall result
// ---------------------------------------------------------------------------

describe("analyzeRequirements overall", () => {
  it("returns pass=true when no P0 findings", () => {
    const doc = makeReqDoc();
    const result = analyzeRequirements(doc);
    expect(result.pass).toBe(true);
  });

  it("returns pass=false when P0 findings exist", () => {
    const doc = makeReqDoc({
      earsCriteria: [],
      userStories: [],
    });
    const result = analyzeRequirements(doc);
    expect(result.pass).toBe(false);
  });

  it("returns pass=true with P2-only findings (warning only)", () => {
    const doc = makeReqDoc({
      earsCriteria: [makeEarsClause({ raw: "当 合适的时候 系统应当 适当的处理" })],
      userStories: [{
        title: "R1",
        description: "",
        earsCriteria: [makeEarsClause({ raw: "当 合适的时候 系统应当 适当的处理" })],
      }],
    });
    const result = analyzeRequirements(doc);
    expect(result.pass).toBe(true);
    expect(result.findings.some((f) => f.severity === "P2")).toBe(true);
  });

  it("shouldBlockDesign returns true when P0 or P1 findings exist", () => {
    const doc = makeReqDoc({
      earsCriteria: [],
      userStories: [],
    });
    const result = analyzeRequirements(doc);
    expect(result.shouldBlockDesign).toBe(true);
  });

  it("shouldBlockDesign returns false when only P2/P3", () => {
    const doc = makeReqDoc();
    const result = analyzeRequirements(doc);
    expect(result.shouldBlockDesign).toBe(false);
  });
});
