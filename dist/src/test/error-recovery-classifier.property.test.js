/**
 * Property-based tests for Interruption_Classifier.
 *
 * Covers Properties 10-13: classification totality + evidence, priority,
 * TDD phase inference, and test file identification.
 *
 * Feature: error-recovery-strategy
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { classifyInterruption, inferTDDPhase, isTestFile, } from "../src/error-recovery.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
const fileChange = () => fc.record({
    filePath: fc.string({ minLength: 1, maxLength: 50 }),
    status: fc.constantFrom("modified", "added", "deleted", "untracked"),
});
const uncommittedResult = (overrides) => fc
    .record({
    changes: fc.array(fileChange()),
    relevantChanges: fc.array(fileChange()),
    isClean: fc.boolean(),
})
    .map((r) => (overrides ? { ...r, ...overrides } : r));
const gitScanResult = () => fc.record({
    commits: fc.constant([]),
    matches: fc.constant([]),
    noNewCommits: fc.boolean(),
});
const progressInconsistencies = () => fc.array(fc.record({
    taskId: fc.string({ minLength: 1, maxLength: 5 }),
    taskTitle: fc.string({ minLength: 1, maxLength: 20 }),
    commitHash: fc.string({ minLength: 7, maxLength: 7 }),
    commitMessage: fc.string({ minLength: 1, maxLength: 20 }),
    commitTimestamp: fc.string({ minLength: 1, maxLength: 20 }),
    type: fc.constant("committed-but-not-marked"),
}));
const phaseInconsistency = () => fc.oneof(fc.constant(null), fc.record({
    currentPhase: fc.constantFrom("build", "review", "test", "ship"),
    expectedPhase: fc.constantFrom("build", "review", "test", "ship"),
    direction: fc.constantFrom("behind", "ahead"),
    evidence: fc.string({ minLength: 1, maxLength: 50 }),
}));
const verificationPassed = () => fc.oneof(fc.constant(null), fc.boolean());
const VALID_CATEGORIES = [
    "task-completed-not-committed",
    "committed-not-progress-updated",
    "progress-updated-not-phase-advanced",
    "subagent-mid-execution",
    "clean-state",
];
// ---------------------------------------------------------------------------
// Property 10: Classification totality + evidence
// ---------------------------------------------------------------------------
describe("Feature: error-recovery-strategy, Property 10: classification totality + evidence", () => {
    it("returns exactly one category whose evidence conditions are satisfied", () => {
        fc.assert(fc.property(uncommittedResult(), gitScanResult(), progressInconsistencies(), phaseInconsistency(), verificationPassed(), (uncommitted, gitScan, progInc, phaseInc, verif) => {
            const result = classifyInterruption(uncommitted, gitScan, progInc, phaseInc, verif);
            // Exactly one category
            expect(VALID_CATEGORIES).toContain(result.category);
            // Evidence conditions must be satisfied
            switch (result.category) {
                case "task-completed-not-committed":
                    expect(uncommitted.relevantChanges.length).toBeGreaterThan(0);
                    break;
                case "committed-not-progress-updated":
                    expect(progInc.length).toBeGreaterThan(0);
                    break;
                case "progress-updated-not-phase-advanced":
                    expect(phaseInc).not.toBeNull();
                    break;
                case "subagent-mid-execution":
                    expect(uncommitted.isClean).toBe(false);
                    break;
                case "clean-state":
                    expect(uncommitted.isClean).toBe(true);
                    expect(progInc).toHaveLength(0);
                    expect(phaseInc).toBeNull();
                    break;
            }
        }), { numRuns: 40 });
    });
});
// ---------------------------------------------------------------------------
// Property 11: Classification priority ordering
// ---------------------------------------------------------------------------
describe("Feature: error-recovery-strategy, Property 11: classification priority", () => {
    it("returns highest-priority category when multiple conditions are true", () => {
        // Construct an input where (a) and (b) are both true
        // (a) has relevant uncommitted changes → task-completed-not-committed
        // (b) has progress inconsistencies → committed-not-progress-updated
        // Should return (a) because it has higher priority
        const uncommitted = {
            changes: [{ filePath: "src/a.ts", status: "modified" }],
            relevantChanges: [{ filePath: "src/a.ts", status: "modified" }],
            isClean: false,
        };
        const progInc = [
            {
                taskId: "1",
                taskTitle: "T1",
                commitHash: "abc1234",
                commitMessage: "done",
                commitTimestamp: "2026-01-01",
                type: "committed-but-not-marked",
            },
        ];
        const result = classifyInterruption(uncommitted, { commits: [], matches: [], noNewCommits: true }, progInc, null, null);
        // (a) should win over (b)
        expect(result.category).toBe("task-completed-not-committed");
    });
    it("returns (b) when (a) is false but (b) is true", () => {
        const uncommitted = {
            changes: [],
            relevantChanges: [],
            isClean: true,
        };
        const progInc = [
            {
                taskId: "1",
                taskTitle: "T1",
                commitHash: "abc1234",
                commitMessage: "done",
                commitTimestamp: "2026-01-01",
                type: "committed-but-not-marked",
            },
        ];
        const result = classifyInterruption(uncommitted, { commits: [], matches: [], noNewCommits: false }, progInc, null, null);
        expect(result.category).toBe("committed-not-progress-updated");
    });
});
// ---------------------------------------------------------------------------
// Property 12: TDD phase inference from file changes
// ---------------------------------------------------------------------------
describe("Feature: error-recovery-strategy, Property 12: TDD phase inference", () => {
    it("infers correct TDD phase from file changes", () => {
        fc.assert(fc.property(fc.record({
            testFile: fc.string({ minLength: 1, maxLength: 20 }).map((s) => `${s}.test.ts`),
            implFile: fc.string({ minLength: 1, maxLength: 20 }).map((s) => `${s}.ts`),
            hasImpl: fc.boolean(),
            verificationPassed: fc.oneof(fc.constant(null), fc.boolean()),
        }), ({ testFile, implFile, hasImpl, verificationPassed }) => {
            const changes = [{ filePath: testFile, status: "added" }];
            if (hasImpl) {
                changes.push({ filePath: implFile, status: "added" });
            }
            const result = inferTDDPhase(changes, verificationPassed);
            if (!hasImpl) {
                expect(result).toBe("red");
            }
            else if (verificationPassed === false) {
                expect(result).toBe("green-incomplete");
            }
            else if (verificationPassed === true) {
                expect(result).toBe("refactor-incomplete");
            }
            // null verification with both files is ambiguous → null is acceptable
        }), { numRuns: 40 });
    });
});
// ---------------------------------------------------------------------------
// Property 13: Test file identification
// ---------------------------------------------------------------------------
describe("Feature: error-recovery-strategy, Property 13: test file identification", () => {
    it("returns true iff path matches a test file pattern", () => {
        fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 60 }), (path) => {
            const result = isTestFile(path);
            const expected = /\.test\.[tj]sx?$/.test(path) ||
                /\.spec\.[tj]sx?$/.test(path) ||
                /^test\//.test(path) ||
                /\/__tests__\//.test(path);
            expect(result).toBe(expected);
        }), { numRuns: 40 });
    });
    it("matches known test file patterns", () => {
        expect(isTestFile("foo.test.ts")).toBe(true);
        expect(isTestFile("bar.spec.ts")).toBe(true);
        expect(isTestFile("test/something.ts")).toBe(true);
        expect(isTestFile("src/__tests__/unit.ts")).toBe(true);
        expect(isTestFile("src/main.ts")).toBe(false);
        expect(isTestFile("README.md")).toBe(false);
    });
});
//# sourceMappingURL=error-recovery-classifier.property.test.js.map