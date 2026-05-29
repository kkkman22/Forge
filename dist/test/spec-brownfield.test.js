/**
 * T-13: Brownfield auto-detection and self-check tests.
 *
 * detectBrownfieldSignals: three signal types → brownfield boolean.
 * runBrownfieldSelfChecks: 5 checks on Delta/Current State/Reversibility.
 *
 * Validates: Requirement 9
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { detectBrownfieldSignals, runBrownfieldSelfChecks } from "../src/spec-brownfield.js";
function makeFm() {
    return {
        feature: "test",
        status: "draft",
        date: "2026-05-23",
        workflow_variant: "requirements-first",
        brownfield: true,
    };
}
function makeBrownfieldBundle() {
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
            delta: {
                added: ["新增 spec.ts 辅助函数"],
                modified: ["修改 spec.ts 接口"],
                unchanged: ["config.ts 不变"],
            },
        },
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
            proposedChange: "- 变更点：修改 spec.ts 接口\n- 不变点：Keep",
            reversibility: "- 回滚清单：Delete\n- 挂载点：spec.ts",
        },
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
        fc.assert(fc.property(fc.record({
            hasGitHistory: fc.boolean(),
            hasPriorSpec: fc.boolean(),
            taskDescription: fc.string(),
        }), (input) => {
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
        }));
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
        bundle.primary.delta = undefined;
        const result = runBrownfieldSelfChecks(bundle);
        expect(result.pass).toBe(false);
        expect(result.findings.some((f) => f.rule === "BF-01")).toBe(true);
    });
    it("reports P0 when Delta subsections are empty", () => {
        const bundle = makeBrownfieldBundle();
        bundle.primary.delta = { added: [], modified: [], unchanged: [] };
        const result = runBrownfieldSelfChecks(bundle);
        expect(result.pass).toBe(false);
    });
    it("reports P0 when Current State missing file:line", () => {
        const bundle = makeBrownfieldBundle();
        bundle.design.currentState = "No file references";
        const result = runBrownfieldSelfChecks(bundle);
        expect(result.pass).toBe(false);
        expect(result.findings.some((f) => f.rule === "BF-02")).toBe(true);
    });
    it("reports P0 when Reversibility is incomplete", () => {
        const bundle = makeBrownfieldBundle();
        bundle.design.reversibility = "Just delete the files";
        const result = runBrownfieldSelfChecks(bundle);
        expect(result.pass).toBe(false);
        expect(result.findings.some((f) => f.rule === "BF-03")).toBe(true);
    });
    it("skips checks for non-brownfield bundle", () => {
        const nonBfBundle = {
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
    it("reports P1 when Delta added references file not in Current State (BF-04)", () => {
        const bundle = makeBrownfieldBundle();
        bundle.primary.delta = {
            added: ["新增 unknown.ts 模块"],
            modified: ["修改 spec.ts 接口"],
            unchanged: ["config.ts 不变"],
        };
        const result = runBrownfieldSelfChecks(bundle);
        expect(result.pass).toBe(false);
        expect(result.findings.some((f) => f.rule === "BF-04")).toBe(true);
        expect(result.findings.find((f) => f.rule === "BF-04").severity).toBe("P1");
    });
    it("reports P1 when Delta modified not covered in Proposed Change (BF-05)", () => {
        const bundle = makeBrownfieldBundle();
        bundle.primary.delta = {
            added: ["新增 spec.ts 辅助函数"],
            modified: ["修改 other.ts 接口"],
            unchanged: ["config.ts 不变"],
        };
        const result = runBrownfieldSelfChecks(bundle);
        expect(result.pass).toBe(false);
        expect(result.findings.some((f) => f.rule === "BF-05")).toBe(true);
    });
});
//# sourceMappingURL=spec-brownfield.test.js.map