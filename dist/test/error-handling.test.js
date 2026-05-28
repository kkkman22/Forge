import { describe, expect, it } from "vitest";
import { classifyExitCode, computeBackoffDelay, DEFAULT_BACKOFF_BASE_MS, RETRYABLE_EXIT_CODES, STUCK_TIMEOUT_MS, shouldRetry, } from "../src/error-handler.js";
describe("Error Handling & Degradation", () => {
    describe("classifyExitCode", () => {
        it("exit 0 = success", () => {
            expect(classifyExitCode(0)).toEqual({ retryable: false, category: "success" });
        });
        it("exit 1 = general error, retryable", () => {
            expect(classifyExitCode(1)).toEqual({ retryable: true, category: "general_error" });
        });
        it("exit 2 = usage error, retryable", () => {
            expect(classifyExitCode(2)).toEqual({ retryable: true, category: "usage_error" });
        });
        it("exit 137 = SIGKILL/OOM, retryable", () => {
            expect(classifyExitCode(137)).toEqual({ retryable: true, category: "sigkill" });
        });
        it("exit 143 = SIGTERM, retryable", () => {
            expect(classifyExitCode(143)).toEqual({ retryable: true, category: "sigterm" });
        });
        it("exit 139 = SIGSEGV, not retryable", () => {
            expect(classifyExitCode(139)).toEqual({ retryable: false, category: "fatal" });
        });
        it("unknown exit code = not retryable", () => {
            expect(classifyExitCode(42)).toEqual({ retryable: false, category: "fatal" });
        });
    });
    describe("computeBackoffDelay", () => {
        it("base delay at attempt 1", () => {
            expect(computeBackoffDelay(1)).toBe(DEFAULT_BACKOFF_BASE_MS);
        });
        it("doubles at attempt 2", () => {
            expect(computeBackoffDelay(2)).toBe(DEFAULT_BACKOFF_BASE_MS * 2);
        });
        it("quadruples at attempt 3", () => {
            expect(computeBackoffDelay(3)).toBe(DEFAULT_BACKOFF_BASE_MS * 4);
        });
    });
    describe("shouldRetry", () => {
        it("retryable exit code with attempts remaining", () => {
            expect(shouldRetry(1, 1)).toBe(true);
        });
        it("retryable exit code at max attempts", () => {
            expect(shouldRetry(1, 3)).toBe(false);
        });
        it("non-retryable exit code never retries", () => {
            expect(shouldRetry(139, 1)).toBe(false);
        });
    });
    describe("constants", () => {
        it("STUCK_TIMEOUT_MS is 600000 (10 min)", () => {
            expect(STUCK_TIMEOUT_MS).toBe(600_000);
        });
        it("RETRYABLE_EXIT_CODES contains {1,2,137,143}", () => {
            expect(RETRYABLE_EXIT_CODES).toEqual(new Set([1, 2, 137, 143]));
        });
        it("DEFAULT_BACKOFF_BASE_MS is 60000 (1 min)", () => {
            expect(DEFAULT_BACKOFF_BASE_MS).toBe(60_000);
        });
    });
});
//# sourceMappingURL=error-handling.test.js.map