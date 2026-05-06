/**
 * Property 24: Skill 反馈分析（自进化 Phase 1-2）
 *
 * Uses fast-check to verify that:
 *   - analyzeSkillFeedback correctly groups entries by command
 *   - Success rates are computed correctly (success / total)
 *   - Commands with >30% failure rate are flagged as alerts
 *   - Empty input produces empty output
 *   - Failure reasons are aggregated and sorted by frequency
 *   - crossValidateFailures finds overlapping patterns
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { analyzeSkillFeedback, crossValidateFailures, FAILURE_RATE_ALERT_THRESHOLD, } from "../src/learn.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
const commandArb = fc.constantFrom("build", "review", "plan", "test", "ship", "decide", "spec", "learn", "debug");
const feedbackEntryArb = fc
    .tuple(commandArb, fc.boolean(), fc.integer({ min: 0, max: 600 }), fc.string({ minLength: 0, maxLength: 50 }))
    .map(([command, success, durationSeconds, failureReason]) => ({
    command,
    success,
    durationSeconds,
    failureReason: success ? "" : failureReason,
}));
const feedbackListArb = fc.array(feedbackEntryArb, {
    minLength: 1,
    maxLength: 50,
});
// ---------------------------------------------------------------------------
// Property 24: Feedback analysis
// ---------------------------------------------------------------------------
describe("Property 24: Skill 反馈分析", () => {
    it("empty input produces empty output", () => {
        const result = analyzeSkillFeedback([]);
        expect(result.commandStats).toHaveLength(0);
        expect(result.alertCommands).toHaveLength(0);
        expect(result.totalEntries).toBe(0);
    });
    it("totalEntries equals input length", () => {
        fc.assert(fc.property(feedbackListArb, (entries) => {
            const result = analyzeSkillFeedback(entries);
            expect(result.totalEntries).toBe(entries.length);
        }), { numRuns: 40 });
    });
    it("sum of all command totalRuns equals totalEntries", () => {
        fc.assert(fc.property(feedbackListArb, (entries) => {
            const result = analyzeSkillFeedback(entries);
            const sumRuns = result.commandStats.reduce((acc, s) => acc + s.totalRuns, 0);
            expect(sumRuns).toBe(result.totalEntries);
        }), { numRuns: 40 });
    });
    it("successCount + failureCount equals totalRuns for each command", () => {
        fc.assert(fc.property(feedbackListArb, (entries) => {
            const result = analyzeSkillFeedback(entries);
            for (const stat of result.commandStats) {
                expect(stat.successCount + stat.failureCount).toBe(stat.totalRuns);
            }
        }), { numRuns: 40 });
    });
    it("successRate is between 0 and 1 inclusive", () => {
        fc.assert(fc.property(feedbackListArb, (entries) => {
            const result = analyzeSkillFeedback(entries);
            for (const stat of result.commandStats) {
                expect(stat.successRate).toBeGreaterThanOrEqual(0);
                expect(stat.successRate).toBeLessThanOrEqual(1);
            }
        }), { numRuns: 40 });
    });
    it("successRate equals successCount / totalRuns", () => {
        fc.assert(fc.property(feedbackListArb, (entries) => {
            const result = analyzeSkillFeedback(entries);
            for (const stat of result.commandStats) {
                const expected = stat.totalRuns > 0 ? stat.successCount / stat.totalRuns : 0;
                expect(stat.successRate).toBeCloseTo(expected, 10);
            }
        }), { numRuns: 40 });
    });
    it("alert commands have failure rate >= threshold and at least 2 runs", () => {
        fc.assert(fc.property(feedbackListArb, (entries) => {
            const result = analyzeSkillFeedback(entries);
            for (const alertCmd of result.alertCommands) {
                const stat = result.commandStats.find((s) => s.command === alertCmd);
                expect(stat).toBeDefined();
                if (stat) {
                    expect(stat.totalRuns).toBeGreaterThanOrEqual(2);
                    expect(1 - stat.successRate).toBeGreaterThanOrEqual(FAILURE_RATE_ALERT_THRESHOLD);
                }
            }
        }), { numRuns: 40 });
    });
    it("non-alert commands with >=2 runs have failure rate below threshold", () => {
        fc.assert(fc.property(feedbackListArb, (entries) => {
            const result = analyzeSkillFeedback(entries);
            const alertSet = new Set(result.alertCommands);
            for (const stat of result.commandStats) {
                if (!alertSet.has(stat.command) && stat.totalRuns >= 2) {
                    expect(1 - stat.successRate).toBeLessThan(FAILURE_RATE_ALERT_THRESHOLD);
                }
            }
        }), { numRuns: 40 });
    });
    it("all-success entries produce no alerts", () => {
        fc.assert(fc.property(fc.array(commandArb, { minLength: 2, maxLength: 10 }), (commands) => {
            const entries = commands.map((cmd) => ({
                command: cmd,
                success: true,
                durationSeconds: 10,
                failureReason: "",
            }));
            const result = analyzeSkillFeedback(entries);
            expect(result.alertCommands).toHaveLength(0);
        }), { numRuns: 50 });
    });
    it("all-failure entries for a command with >=2 runs produce an alert", () => {
        const entries = [
            { command: "build", success: false, durationSeconds: 10, failureReason: "test failed" },
            { command: "build", success: false, durationSeconds: 15, failureReason: "type error" },
            { command: "build", success: false, durationSeconds: 12, failureReason: "test failed" },
        ];
        const result = analyzeSkillFeedback(entries);
        expect(result.alertCommands).toContain("build");
    });
    it("failure reasons are sorted by frequency (most common first)", () => {
        fc.assert(fc.property(feedbackListArb, (entries) => {
            const result = analyzeSkillFeedback(entries);
            for (const stat of result.commandStats) {
                for (let i = 1; i < stat.topFailureReasons.length; i++) {
                    expect(stat.topFailureReasons[i - 1].count).toBeGreaterThanOrEqual(stat.topFailureReasons[i].count);
                }
            }
        }), { numRuns: 40 });
    });
    it("avgDurationSeconds is non-negative", () => {
        fc.assert(fc.property(feedbackListArb, (entries) => {
            const result = analyzeSkillFeedback(entries);
            for (const stat of result.commandStats) {
                expect(stat.avgDurationSeconds).toBeGreaterThanOrEqual(0);
            }
        }), { numRuns: 40 });
    });
    it("commandStats are sorted by successRate ascending (worst first)", () => {
        fc.assert(fc.property(feedbackListArb, (entries) => {
            const result = analyzeSkillFeedback(entries);
            for (let i = 1; i < result.commandStats.length; i++) {
                expect(result.commandStats[i - 1].successRate).toBeLessThanOrEqual(result.commandStats[i].successRate);
            }
        }), { numRuns: 40 });
    });
});
// ---------------------------------------------------------------------------
// Property 24: Cross-validation
// ---------------------------------------------------------------------------
describe("Property 24: 失败模式交叉验证", () => {
    it("empty inputs produce empty result", () => {
        expect(crossValidateFailures([], ["something"])).toHaveLength(0);
        expect(crossValidateFailures(["something"], [])).toHaveLength(0);
        expect(crossValidateFailures([], [])).toHaveLength(0);
    });
    it("exact matches are found", () => {
        const result = crossValidateFailures(["module not found"], ["module not found"]);
        expect(result).toContain("module not found");
    });
    it("case-insensitive matching works", () => {
        const result = crossValidateFailures(["Module Not Found"], ["module not found"]);
        expect(result).toContain("Module Not Found");
    });
    it("substring matching works (feedback reason contained in known failure)", () => {
        const result = crossValidateFailures(["type error"], ["TypeScript type error in monorepo setup"]);
        expect(result).toContain("type error");
    });
    it("non-overlapping inputs produce empty result", () => {
        fc.assert(fc.property(fc.array(fc.constant("aaa-unique-feedback"), { minLength: 1, maxLength: 5 }), fc.array(fc.constant("zzz-unique-known"), { minLength: 1, maxLength: 5 }), (feedbackReasons, knownFailures) => {
            const result = crossValidateFailures(feedbackReasons, knownFailures);
            expect(result).toHaveLength(0);
        }), { numRuns: 20 });
    });
    it("result is a subset of feedbackReasons", () => {
        const feedback = ["error A", "error B", "error C"];
        const known = ["error A is common", "error C happens often"];
        const result = crossValidateFailures(feedback, known);
        for (const r of result) {
            expect(feedback).toContain(r);
        }
    });
});
//# sourceMappingURL=learn-feedback.property.test.js.map