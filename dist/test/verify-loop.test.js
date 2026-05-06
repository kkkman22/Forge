/**
 * Tests for the Ralph Loop verification cycle module.
 *
 * Covers:
 *   - parseVerifyConfig: extracts commands, timeout, maxAttempts correctly
 *   - parseVerifyConfig: handles missing/default values
 *   - shouldRetryVerify: retry logic
 *   - advanceVerifyLoop: state machine (pass → commit, fail+retry → retry, fail+max → soft_failure)
 *   - Property: verifyAttempts is bounded (never exceeds maxAttempts)
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7**
 */
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { advanceVerifyLoop, parseVerifyConfig, runVerifyStep, shouldRetryVerify, } from "../src/verify-loop.js";
// ---------------------------------------------------------------------------
// parseVerifyConfig
// ---------------------------------------------------------------------------
describe("parseVerifyConfig", () => {
    it("extracts commands, timeout, and maxAttempts from full config", () => {
        const content = [
            "---",
            "project: my-app",
            "verify_commands:",
            '  - "npm run lint"',
            '  - "npm run typecheck"',
            '  - "npm test -- --run"',
            "verify_timeout: 60",
            "verify_max_attempts: 5",
            "---",
            "# Config body",
        ].join("\n");
        const config = parseVerifyConfig(content);
        expect(config.commands).toEqual([
            '"npm run lint"',
            '"npm run typecheck"',
            '"npm test -- --run"',
        ]);
        expect(config.timeoutMs).toBe(60_000);
        expect(config.maxAttempts).toBe(5);
    });
    it("extracts commands without quotes", () => {
        const content = [
            "---",
            "verify_commands:",
            "  - npm run lint",
            "  - npm run typecheck",
            "verify_timeout: 90",
            "verify_max_attempts: 2",
            "---",
            "# Config",
        ].join("\n");
        const config = parseVerifyConfig(content);
        expect(config.commands).toEqual(["npm run lint", "npm run typecheck"]);
        expect(config.timeoutMs).toBe(90_000);
        expect(config.maxAttempts).toBe(2);
    });
    it("uses defaults when verify fields are missing", () => {
        const content = ["---", "project: my-app", "stack: [TypeScript]", "---", "# Config"].join("\n");
        const config = parseVerifyConfig(content);
        expect(config.commands).toEqual([]);
        expect(config.timeoutMs).toBe(120_000); // default 120s
        expect(config.maxAttempts).toBe(3); // default 3
    });
    it("uses defaults when frontmatter is missing entirely", () => {
        const content = "# Just a markdown file with no frontmatter";
        const config = parseVerifyConfig(content);
        expect(config.commands).toEqual([]);
        expect(config.timeoutMs).toBe(120_000);
        expect(config.maxAttempts).toBe(3);
    });
    it("uses default timeout when verify_timeout is invalid", () => {
        const content = [
            "---",
            "verify_commands:",
            "  - npm test",
            "verify_timeout: not-a-number",
            "verify_max_attempts: 2",
            "---",
        ].join("\n");
        const config = parseVerifyConfig(content);
        expect(config.commands).toEqual(["npm test"]);
        expect(config.timeoutMs).toBe(120_000); // fallback to default
        expect(config.maxAttempts).toBe(2);
    });
    it("uses default max_attempts when verify_max_attempts is zero", () => {
        const content = [
            "---",
            "verify_commands:",
            "  - npm test",
            "verify_timeout: 30",
            "verify_max_attempts: 0",
            "---",
        ].join("\n");
        const config = parseVerifyConfig(content);
        expect(config.maxAttempts).toBe(3); // fallback to default
    });
    it("uses default timeout when verify_timeout is negative", () => {
        const content = ["---", "verify_commands:", "  - npm test", "verify_timeout: -10", "---"].join("\n");
        const config = parseVerifyConfig(content);
        expect(config.timeoutMs).toBe(120_000); // fallback to default
    });
    it("handles empty verify_commands list", () => {
        const content = ["---", "verify_commands: []", "---"].join("\n");
        const config = parseVerifyConfig(content);
        expect(config.commands).toEqual([]);
    });
    it("handles single command", () => {
        const content = ["---", "verify_commands:", "  - npm test", "---"].join("\n");
        const config = parseVerifyConfig(content);
        expect(config.commands).toEqual(["npm test"]);
    });
});
// ---------------------------------------------------------------------------
// runVerifyStep
// ---------------------------------------------------------------------------
describe("runVerifyStep", () => {
    const config = {
        commands: ["npm run lint", "npm test"],
        timeoutMs: 60_000,
        maxAttempts: 3,
    };
    it("returns passed=true when no failed command", () => {
        const result = runVerifyStep(config, 1);
        expect(result.passed).toBe(true);
        expect(result.attempt).toBe(1);
        expect(result.failedCommand).toBeUndefined();
        expect(result.error).toBeUndefined();
    });
    it("returns passed=false with failed command info", () => {
        const result = runVerifyStep(config, 2, "npm run lint", "Exit code 1");
        expect(result.passed).toBe(false);
        expect(result.attempt).toBe(2);
        expect(result.failedCommand).toBe("npm run lint");
        expect(result.error).toBe("Exit code 1");
    });
    it("returns passed=false with failed command but no error message", () => {
        const result = runVerifyStep(config, 1, "npm test");
        expect(result.passed).toBe(false);
        expect(result.failedCommand).toBe("npm test");
        expect(result.error).toBeUndefined();
    });
});
// ---------------------------------------------------------------------------
// shouldRetryVerify
// ---------------------------------------------------------------------------
describe("shouldRetryVerify", () => {
    const config = {
        commands: ["npm test"],
        timeoutMs: 60_000,
        maxAttempts: 3,
    };
    it("returns true when failed and attempt < maxAttempts", () => {
        const result = { passed: false, failedCommand: "npm test", attempt: 1 };
        expect(shouldRetryVerify(result, config)).toBe(true);
    });
    it("returns true when failed and attempt is one less than max", () => {
        const result = { passed: false, failedCommand: "npm test", attempt: 2 };
        expect(shouldRetryVerify(result, config)).toBe(true);
    });
    it("returns false when failed and attempt equals maxAttempts", () => {
        const result = { passed: false, failedCommand: "npm test", attempt: 3 };
        expect(shouldRetryVerify(result, config)).toBe(false);
    });
    it("returns false when failed and attempt exceeds maxAttempts", () => {
        const result = { passed: false, failedCommand: "npm test", attempt: 4 };
        expect(shouldRetryVerify(result, config)).toBe(false);
    });
    it("returns false when passed (no retry needed)", () => {
        const result = { passed: true, attempt: 1 };
        expect(shouldRetryVerify(result, config)).toBe(false);
    });
});
// ---------------------------------------------------------------------------
// advanceVerifyLoop state machine
// ---------------------------------------------------------------------------
describe("advanceVerifyLoop", () => {
    it("returns commit when passed=true (attempt 1)", () => {
        const decision = advanceVerifyLoop(1, true, 3);
        expect(decision).toEqual({ action: "commit" });
    });
    it("returns commit when passed=true (any attempt)", () => {
        const decision = advanceVerifyLoop(2, true, 3);
        expect(decision).toEqual({ action: "commit" });
    });
    it("returns commit when passed=true at max attempt", () => {
        const decision = advanceVerifyLoop(3, true, 3);
        expect(decision).toEqual({ action: "commit" });
    });
    it("returns retry when failed and attempt < max", () => {
        const decision = advanceVerifyLoop(1, false, 3);
        expect(decision).toEqual({ action: "retry", attempt: 2 });
    });
    it("returns retry with incremented attempt", () => {
        const decision = advanceVerifyLoop(2, false, 3);
        expect(decision).toEqual({ action: "retry", attempt: 3 });
    });
    it("returns soft_failure when failed and attempt >= max", () => {
        const decision = advanceVerifyLoop(3, false, 3);
        expect(decision).toEqual({ action: "soft_failure" });
    });
    it("returns soft_failure when attempt exceeds max", () => {
        const decision = advanceVerifyLoop(5, false, 3);
        expect(decision).toEqual({ action: "soft_failure" });
    });
    it("returns soft_failure with maxAttempts=1 on first failure", () => {
        const decision = advanceVerifyLoop(1, false, 1);
        expect(decision).toEqual({ action: "soft_failure" });
    });
});
// ---------------------------------------------------------------------------
// Property: verifyAttempts is bounded (never exceeds maxAttempts)
// ---------------------------------------------------------------------------
describe("Property: verifyAttempts bounded", () => {
    /**
     * **Validates: Requirements 2.4, 2.5, 2.6**
     *
     * For any sequence of verify loop iterations, the attempt counter
     * is bounded by maxAttempts. The loop either commits (on pass) or
     * reaches soft_failure — it never produces unbounded retries.
     */
    it("verify loop terminates within maxAttempts iterations", () => {
        fc.assert(fc.property(fc.integer({ min: 1, max: 20 }), // maxAttempts
        fc.array(fc.boolean(), { minLength: 1, maxLength: 30 }), // pass/fail sequence
        (maxAttempts, outcomes) => {
            let attempt = 1;
            let terminated = false;
            for (const passed of outcomes) {
                if (terminated)
                    break;
                const decision = advanceVerifyLoop(attempt, passed, maxAttempts);
                if (decision.action === "commit") {
                    terminated = true;
                }
                else if (decision.action === "soft_failure") {
                    terminated = true;
                    // At soft_failure, attempt should be >= maxAttempts
                    expect(attempt).toBeGreaterThanOrEqual(maxAttempts);
                }
                else if (decision.action === "retry") {
                    // Retry attempt should be within bounds
                    expect(decision.attempt).toBeLessThanOrEqual(maxAttempts);
                    attempt = decision.attempt;
                }
            }
            // If all outcomes were failures, the loop must have terminated
            // or the attempt counter must be <= maxAttempts
            expect(attempt).toBeLessThanOrEqual(maxAttempts);
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 2.2, 2.6**
     *
     * When verification passes, the decision is always "commit"
     * regardless of the attempt number.
     */
    it("passing verification always produces commit", () => {
        fc.assert(fc.property(fc.integer({ min: 1, max: 100 }), // attempt
        fc.integer({ min: 1, max: 100 }), // maxAttempts
        (attempt, maxAttempts) => {
            const decision = advanceVerifyLoop(attempt, true, maxAttempts);
            expect(decision).toEqual({ action: "commit" });
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 2.3, 2.5**
     *
     * shouldRetryVerify is consistent with advanceVerifyLoop:
     * retry iff failed and attempt < maxAttempts.
     */
    it("shouldRetryVerify is consistent with advanceVerifyLoop", () => {
        fc.assert(fc.property(fc.integer({ min: 1, max: 50 }), // attempt
        fc.boolean(), // passed
        fc.integer({ min: 1, max: 50 }), // maxAttempts
        (attempt, passed, maxAttempts) => {
            const config = {
                commands: ["npm test"],
                timeoutMs: 60_000,
                maxAttempts,
            };
            const result = {
                passed,
                attempt,
                ...(passed ? {} : { failedCommand: "npm test" }),
            };
            const shouldRetry = shouldRetryVerify(result, config);
            const decision = advanceVerifyLoop(attempt, passed, maxAttempts);
            if (shouldRetry) {
                expect(decision.action).toBe("retry");
            }
            if (decision.action === "retry") {
                expect(shouldRetry).toBe(true);
            }
        }), { numRuns: 50 });
    });
});
//# sourceMappingURL=verify-loop.test.js.map