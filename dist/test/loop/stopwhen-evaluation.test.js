/**
 * @file stopWhen conditional termination tests.
 *
 * Validates evaluation of structured stop conditions against loop state:
 * - max-iterations boundary
 * - phase-reached targets
 * - commit-count targets
 * - parseStopCondition parsing
 *
 * RED: Will fail until src/loop/stopwhen.ts is created.
 */
import { describe, expect, it } from "vitest";
async function loadModule() {
    return import("../../src/loop/stopwhen.js");
}
const BASE_STATE = {
    totalIterations: 5,
    consecutiveFailures: 0,
    lastSuccessCommit: "abc123",
    phase: "build",
    haltReason: "",
};
describe("stopWhen Evaluation", () => {
    // ── max-iterations ──────────────────────────────────────────────────
    describe("max-iterations", () => {
        it("stops when totalIterations >= maxIterations", async () => {
            const { evaluateStopWhen } = await loadModule();
            const result = evaluateStopWhen("max-iterations:10", {
                ...BASE_STATE,
                totalIterations: 10,
            });
            expect(result.shouldStop).toBe(true);
        });
        it("does not stop when totalIterations < maxIterations", async () => {
            const { evaluateStopWhen } = await loadModule();
            const result = evaluateStopWhen("max-iterations:10", {
                ...BASE_STATE,
                totalIterations: 9,
            });
            expect(result.shouldStop).toBe(false);
        });
        it("stops when totalIterations exceeds maxIterations", async () => {
            const { evaluateStopWhen } = await loadModule();
            const result = evaluateStopWhen("max-iterations:5", {
                ...BASE_STATE,
                totalIterations: 7,
            });
            expect(result.shouldStop).toBe(true);
        });
    });
    // ── phase-reached ────────────────────────────────────────────────────
    describe("phase-reached", () => {
        it("stops when target phase is reached", async () => {
            const { evaluateStopWhen } = await loadModule();
            const result = evaluateStopWhen("phase-reached:ship", {
                ...BASE_STATE,
                phase: "ship",
            });
            expect(result.shouldStop).toBe(true);
        });
        it("does not stop when phase not yet reached", async () => {
            const { evaluateStopWhen } = await loadModule();
            const result = evaluateStopWhen("phase-reached:ship", {
                ...BASE_STATE,
                phase: "build",
            });
            expect(result.shouldStop).toBe(false);
        });
    });
    // ── commit-count ─────────────────────────────────────────────────────
    describe("commit-count", () => {
        it("stops when lastSuccessCommit is non-empty (at least 1 commit)", async () => {
            const { evaluateStopWhen } = await loadModule();
            const result = evaluateStopWhen("commit-count:1", {
                ...BASE_STATE,
                lastSuccessCommit: "abc123",
            });
            expect(result.shouldStop).toBe(true);
        });
        it("does not stop when no commits yet", async () => {
            const { evaluateStopWhen } = await loadModule();
            const result = evaluateStopWhen("commit-count:1", {
                ...BASE_STATE,
                lastSuccessCommit: "",
            });
            expect(result.shouldStop).toBe(false);
        });
        // P3 FIX: commit-count:N for N>1 must be reachable. Previously current
        // was derived as `lastSuccessCommit !== "" ? 1 : 0`, capping at 1, so
        // commit-count:3 could never fire — a silent dead feature.
        it("stops when successCommitCount reaches target (N=3)", async () => {
            const { evaluateStopWhen } = await loadModule();
            const result = evaluateStopWhen("commit-count:3", {
                ...BASE_STATE,
                successCommitCount: 3,
            });
            expect(result.shouldStop).toBe(true);
            expect(result.reason).toContain("3/3");
        });
        it("does not stop when successCommitCount below target (N=3, have 2)", async () => {
            const { evaluateStopWhen } = await loadModule();
            const result = evaluateStopWhen("commit-count:3", {
                ...BASE_STATE,
                successCommitCount: 2,
            });
            expect(result.shouldStop).toBe(false);
        });
        it("stops when successCommitCount exceeds target (N=2, have 5)", async () => {
            const { evaluateStopWhen } = await loadModule();
            const result = evaluateStopWhen("commit-count:2", {
                ...BASE_STATE,
                successCommitCount: 5,
            });
            expect(result.shouldStop).toBe(true);
        });
    });
    // ── empty / no condition ─────────────────────────────────────────────
    describe("empty condition", () => {
        it("empty string never stops", async () => {
            const { evaluateStopWhen } = await loadModule();
            const result = evaluateStopWhen("", BASE_STATE);
            expect(result.shouldStop).toBe(false);
        });
    });
    // ── result includes reason ───────────────────────────────────────────
    describe("result structure", () => {
        it("includes stopReason when shouldStop is true", async () => {
            const { evaluateStopWhen } = await loadModule();
            const result = evaluateStopWhen("max-iterations:5", {
                ...BASE_STATE,
                totalIterations: 5,
            });
            expect(result.shouldStop).toBe(true);
            expect(result.reason).toContain("max-iterations");
        });
        it("reason is empty string when shouldStop is false", async () => {
            const { evaluateStopWhen } = await loadModule();
            const result = evaluateStopWhen("max-iterations:10", BASE_STATE);
            expect(result.shouldStop).toBe(false);
            expect(result.reason).toBe("");
        });
    });
    // ── parseStopCondition ───────────────────────────────────────────────
    describe("parseStopCondition", () => {
        it("parses max-iterations condition", async () => {
            const { parseStopCondition } = await loadModule();
            const parsed = parseStopCondition("max-iterations:15");
            expect(parsed).toEqual({ type: "max-iterations", value: 15 });
        });
        it("parses phase-reached condition", async () => {
            const { parseStopCondition } = await loadModule();
            const parsed = parseStopCondition("phase-reached:completed");
            expect(parsed).toEqual({ type: "phase-reached", value: "completed" });
        });
        it("returns null for unrecognized condition", async () => {
            const { parseStopCondition } = await loadModule();
            const parsed = parseStopCondition("unknown-condition");
            expect(parsed).toBeNull();
        });
        it("returns null for empty string", async () => {
            const { parseStopCondition } = await loadModule();
            const parsed = parseStopCondition("");
            expect(parsed).toBeNull();
        });
        it("rejects zero value for max-iterations", async () => {
            const { parseStopCondition } = await loadModule();
            expect(parseStopCondition("max-iterations:0")).toBeNull();
        });
        it("rejects zero value for commit-count", async () => {
            const { parseStopCondition } = await loadModule();
            expect(parseStopCondition("commit-count:0")).toBeNull();
        });
        it("rejects negative value patterns (no match)", async () => {
            const { parseStopCondition } = await loadModule();
            expect(parseStopCondition("max-iterations:-1")).toBeNull();
        });
    });
});
//# sourceMappingURL=stopwhen-evaluation.test.js.map