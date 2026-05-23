/**
 * T-13: Brownfield auto-detection and self-check tests.
 *
 * detectBrownfieldSignals: three signal types → brownfield boolean.
 * runBrownfieldSelfChecks: 5 checks on Delta/Current State/Reversibility.
 *
 * Validates: Requirement 9
 */
import * as fc from "fast-check";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { detectBrownfieldSignals, runBrownfieldSelfChecks } from "../src/spec-brownfield.js";
import type { SpecBundle, RequirementsDocument, DesignDocument, SpecFileFrontmatter } from "../src/spec-bundle.js";

function makeFm(): SpecFileFrontmatter {
  return { feature: "test", status: "draft", date: "2026-05-23", workflow_variant: "requirements-first", brownfield: true };
}

function makeBrownfieldBundle(): SpecBundle {
  return {
    feature: "test",
    kind: "feature",
    layout: "three-file",
    variant: "requirements-first",
    primary: {
      frontmatter: makeFm(),
      intro: "Brownfield intro",
      glossary: [],
      userStories: [],
      earsCriteria: [],
      nonFunctional: [],
      outOfScope: [],
      delta: { added: ["a.ts"], modified: ["b.ts"], unchanged: ["c.ts"] },
    } as RequirementsDocument,
    design: {
      frontmatter: makeFm(),
      overview: "O",
      architecture: "A",
      componentInterfaces: [],
      dataModel: "",
      errorHandling: "",
      testingStrategy: "",
      rollout: "",
      openQuestions: [],
      currentState: "src/spec.ts:1-50",
      proposedChange: "- 变更点：Add\n- 不变点：Keep",
      reversibility: "- 回滚清单：Delete\n- 挂载点：spec.ts",
    } as DesignDocument,
  };
}

// ---------------------------------------------------------------------------
// detectBrownfieldSignals
// ---------------------------------------------------------------------------

describe("detectBrownfieldSignals", () => {
  it("detects brownfield from git history signal", () => {
    const result = detectBrownfieldSignals({
      hasGitHistory: true,
      hasPriorSpec: false,
      taskDescription: "new feature",
    });
    expect(result.brownfield).toBe(true);
    expect(result.signals).toContain("git-history");
  });

  it("detects brownfield from prior spec signal", () => {
    const result = detectBrownfieldSignals({
      hasGitHistory: false,
      hasPriorSpec: true,
      taskDescription: "add feature",
    });
    expect(result.brownfield).toBe(true);
    expect(result.signals).toContain("prior-spec");
  });

  it("detects brownfield from keyword signal", () => {
    const result = detectBrownfieldSignals({
      hasGitHistory: false,
      hasPriorSpec: false,
      taskDescription: "改造现有模块",
    });
    expect(result.brownfield).toBe(true);
    expect(result.signals).toContain("keyword");
  });

  it("returns false when no signals", () => {
    const result = detectBrownfieldSignals({
      hasGitHistory: false,
      hasPriorSpec: false,
      taskDescription: "new feature from scratch",
    });
    expect(result.brownfield).toBe(false);
    expect(result.signals).toHaveLength(0);
  });

  it("detects multiple signals", () => {
    const result = detectBrownfieldSignals({
      hasGitHistory: true,
      hasPriorSpec: true,
      taskDescription: "重构模块",
    });
    expect(result.brownfield).toBe(true);
    expect(result.signals.length).toBeGreaterThanOrEqual(2);
  });

  // English keywords
  it("detects English brownfield keywords", () => {
    const result = detectBrownfieldSignals({
      hasGitHistory: false,
      hasPriorSpec: false,
      taskDescription: "refactor existing module",
    });
    expect(result.brownfield).toBe(true);
    expect(result.signals).toContain("keyword");
  });

  // PBT: signal monotonicity
  it("adding signals never flips brownfield from true to false", () => {
    fc.assert(
      fc.property(
        fc.record({
          hasGitHistory: fc.boolean(),
          hasPriorSpec: fc.boolean(),
          taskDescription: fc.string(),
        }),
        (input) => {
          const result = detectBrownfieldSignals(input);
          // Adding more signals should never decrease brownfield
          const resultWithExtra = detectBrownfieldSignals({
            ...input,
            hasGitHistory: true,
            hasPriorSpec: true,
          });
          if (result.brownfield) {
            expect(resultWithExtra.brownfield).toBe(true);
          }
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// runBrownfieldSelfChecks
// ---------------------------------------------------------------------------

describe("runBrownfieldSelfChecks", () => {
  it("passes with complete brownfield sections", () => {
    const bundle = makeBrownfieldBundle();
    const result = runBrownfieldSelfChecks(bundle);
    expect(result.pass).toBe(true);
    expect(result.findings).toHaveLength(0);
  });

  it("reports P0 when Delta is missing", () => {
    const bundle = makeBrownfieldBundle();
    (bundle.primary as RequirementsDocument).delta = undefined;

    const result = runBrownfieldSelfChecks(bundle);
    expect(result.pass).toBe(false);
    expect(result.findings.some((f) => f.rule === "BF-01")).toBe(true);
  });

  it("reports P0 when Delta subsections are empty", () => {
    const bundle = makeBrownfieldBundle();
    (bundle.primary as RequirementsDocument).delta = { added: [], modified: [], unchanged: [] };

    const result = runBrownfieldSelfChecks(bundle);
    expect(result.pass).toBe(false);
  });

  it("reports P0 when Current State missing file:line", () => {
    const bundle = makeBrownfieldBundle();
    (bundle.design as DesignDocument).currentState = "No file references";

    const result = runBrownfieldSelfChecks(bundle);
    expect(result.pass).toBe(false);
    expect(result.findings.some((f) => f.rule === "BF-02")).toBe(true);
  });

  it("reports P0 when Reversibility is incomplete", () => {
    const bundle = makeBrownfieldBundle();
    (bundle.design as DesignDocument).reversibility = "Just delete the files";

    const result = runBrownfieldSelfChecks(bundle);
    expect(result.pass).toBe(false);
    expect(result.findings.some((f) => f.rule === "BF-03")).toBe(true);
  });

  it("skips checks for non-brownfield bundle", () => {
    const nonBfBundle: SpecBundle = {
      feature: "test",
      kind: "feature",
      layout: "three-file",
      variant: "requirements-first",
      primary: {
        frontmatter: { ...makeFm(), brownfield: false },
        intro: "",
        glossary: [],
        userStories: [],
        earsCriteria: [],
        nonFunctional: [],
        outOfScope: [],
      },
    };

    const result = runBrownfieldSelfChecks(nonBfBundle);
    expect(result.pass).toBe(true); // Skipped = pass
    expect(result.skipped).toBe(true);
  });
});
