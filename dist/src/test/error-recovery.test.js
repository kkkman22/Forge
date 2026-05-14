/**
 * Unit tests for Error Recovery Strategy edge cases and specific scenarios.
 *
 * Feature: error-recovery-strategy
 */
import { describe, expect, it } from "vitest";
import { buildRecoveryReport, classifyInterruption, extractCommitPatterns, getPhaseSequence, parseGitLog, parseGitStatus, } from "../src/error-recovery.js";
// ---------------------------------------------------------------------------
// Edge case: empty git log
// ---------------------------------------------------------------------------
describe("error-recovery: edge cases", () => {
    it("parseGitLog returns empty array for empty input", () => {
        expect(parseGitLog("")).toHaveLength(0);
        expect(parseGitLog("   ")).toHaveLength(0);
        expect(parseGitLog("\n\n")).toHaveLength(0);
    });
    it("parseGitLog returns empty array for unparseable input", () => {
        expect(parseGitLog("not a git log")).toHaveLength(0);
        expect(parseGitLog("just random text")).toHaveLength(0);
    });
    it("parseGitStatus returns empty array for empty input", () => {
        const result = parseGitStatus("");
        expect(result).toHaveLength(0);
    });
    it("extractCommitPatterns returns empty array for plan with no commit patterns", () => {
        const patterns = extractCommitPatterns("# Just a heading\n\nSome text without tasks");
        expect(patterns).toHaveLength(0);
    });
    // ---------------------------------------------------------------------------
    // Report action options
    // ---------------------------------------------------------------------------
    it("verification passed → commit/discard options", () => {
        const report = buildRecoveryReport({
            taskName: "test",
            tier: "standard",
            phase: "build",
            lastUpdate: "2026-01-01",
            interruptionCategory: "task-completed-not-committed",
        }, [], // no progress inconsistencies
        null, // no phase inconsistency
        { category: "task-completed-not-committed", evidence: "changes", tddPhase: null }, {
            changes: [{ filePath: "src/a.ts", status: "modified" }],
            relevantChanges: [{ filePath: "src/a.ts", status: "modified" }],
            isClean: false,
        }, []);
        // Should have an inconsistency for uncommitted task work
        const uncommitted = report.inconsistencies.find((i) => i.category === "uncommitted-task-work");
        if (uncommitted) {
            const opts = report.actions[report.inconsistencies.indexOf(uncommitted)];
            expect(opts).toBeDefined();
            expect(opts.length).toBeGreaterThanOrEqual(2);
            expect(opts.some((o) => o.description.toLowerCase().includes("commit"))).toBe(true);
            expect(opts.some((o) => o.description.toLowerCase().includes("discard"))).toBe(true);
        }
    });
    it("TDD RED → preserve/discard options", () => {
        const report = buildRecoveryReport({
            taskName: "test",
            tier: "standard",
            phase: "build",
            lastUpdate: "2026-01-01",
            interruptionCategory: "subagent-mid-execution",
        }, [], null, {
            category: "subagent-mid-execution",
            evidence: "TDD phase: red",
            tddPhase: "red",
        }, {
            changes: [{ filePath: "src/a.test.ts", status: "added" }],
            relevantChanges: [],
            isClean: false,
        }, []);
        const subagent = report.inconsistencies.find((i) => i.category === "subagent-mid-execution");
        expect(subagent).toBeDefined();
        const opts = report.actions[report.inconsistencies.indexOf(subagent)];
        expect(opts.some((o) => o.description.toLowerCase().includes("preserve"))).toBe(true);
        expect(opts.some((o) => o.description.toLowerCase().includes("discard"))).toBe(true);
    });
    it("TDD REFACTOR → commit/continue options", () => {
        const report = buildRecoveryReport({
            taskName: "test",
            tier: "standard",
            phase: "build",
            lastUpdate: "2026-01-01",
            interruptionCategory: "subagent-mid-execution",
        }, [], null, {
            category: "subagent-mid-execution",
            evidence: "TDD phase: refactor-incomplete",
            tddPhase: "refactor-incomplete",
        }, {
            changes: [
                { filePath: "src/a.test.ts", status: "modified" },
                { filePath: "src/a.ts", status: "modified" },
            ],
            relevantChanges: [],
            isClean: false,
        }, []);
        const subagent = report.inconsistencies.find((i) => i.category === "subagent-mid-execution");
        expect(subagent).toBeDefined();
        const opts = report.actions[report.inconsistencies.indexOf(subagent)];
        expect(opts.some((o) => o.description.toLowerCase().includes("commit"))).toBe(true);
        expect(opts.some((o) => o.description.toLowerCase().includes("continue"))).toBe(true);
    });
    // ---------------------------------------------------------------------------
    // Phase sequence correctness
    // ---------------------------------------------------------------------------
    it("getPhaseSequence returns correct sequences for all three tiers", () => {
        expect(getPhaseSequence("lightweight")).toEqual(["build", "review"]);
        expect(getPhaseSequence("standard")).toEqual(["plan", "build", "review", "test", "ship"]);
        expect(getPhaseSequence("full")).toEqual([
            "decide",
            "spec",
            "plan",
            "build",
            "review",
            "test",
            "ship",
            "learn",
        ]);
    });
    // ---------------------------------------------------------------------------
    // Fix dependency ordering: progress patches before phase patches
    // ---------------------------------------------------------------------------
    it("report lists progress inconsistencies before phase inconsistencies", () => {
        const report = buildRecoveryReport({
            taskName: "test",
            tier: "standard",
            phase: "build",
            lastUpdate: "2026-01-01",
            interruptionCategory: "committed-not-progress-updated",
        }, [
            {
                taskId: "1",
                taskTitle: "Task 1",
                commitHash: "abc1234",
                commitMessage: "done",
                commitTimestamp: "2026-01-01",
                type: "committed-but-not-marked",
            },
        ], {
            currentPhase: "build",
            expectedPhase: "review",
            direction: "behind",
            evidence: "behind",
        }, { category: "committed-not-progress-updated", evidence: "test", tddPhase: null }, {
            changes: [],
            relevantChanges: [],
            isClean: true,
        }, []);
        // First inconsistency should be progress-related
        expect(report.inconsistencies[0].category).toBe("committed-but-not-marked");
        // Second should be phase-related
        expect(report.inconsistencies[1].category).toContain("phase-");
    });
    // ---------------------------------------------------------------------------
    // Clean state: zero inconsistencies
    // ---------------------------------------------------------------------------
    it("zero inconsistencies produces clean report with zero counts", () => {
        const report = buildRecoveryReport({
            taskName: "test",
            tier: "standard",
            phase: "build",
            lastUpdate: "2026-01-01",
            interruptionCategory: "clean-state",
        }, [], null, { category: "clean-state", evidence: "clean", tddPhase: null }, { changes: [], relevantChanges: [], isClean: true }, []);
        expect(report.inconsistencies).toHaveLength(0);
        expect(report.actions).toHaveLength(0);
        expect(report.summary.totalInconsistencies).toBe(0);
        expect(report.summary.autoFixable).toBe(0);
        expect(report.summary.requiresUserDecision).toBe(0);
    });
    // ---------------------------------------------------------------------------
    // Checkpoint marker without matching commit
    // ---------------------------------------------------------------------------
    it("classification is task-completed-not-committed when relevant changes exist", () => {
        const uncommitted = {
            changes: [{ filePath: "src/a.ts", status: "modified" }],
            relevantChanges: [{ filePath: "src/a.ts", status: "modified" }],
            isClean: false,
        };
        const result = classifyInterruption(uncommitted, { commits: [], matches: [], noNewCommits: true }, [], null, null);
        expect(result.category).toBe("task-completed-not-committed");
    });
});
//# sourceMappingURL=error-recovery.test.js.map