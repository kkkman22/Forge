import { describe, expect, it } from "vitest";
describe("createLogEntry", () => {
    it("should create a LogEntry with required fields", async () => {
        const { createLogEntry } = await import("../../src/logger/log-entry.js");
        const entry = createLogEntry("iteration_start", "info", "Iteration started");
        expect(entry).toMatchObject({
            event: "iteration_start",
            level: "info",
            message: "Iteration started",
        });
        expect(entry.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
    it("should include optional context fields", async () => {
        const { createLogEntry } = await import("../../src/logger/log-entry.js");
        const entry = createLogEntry("agent_call", "debug", "Calling agent", {
            runId: "run-123",
            iteration: 5,
            phase: "build",
            branchName: "feature/x",
            commitCount: 3,
        });
        expect(entry.runId).toBe("run-123");
        expect(entry.iteration).toBe(5);
        expect(entry.phase).toBe("build");
        expect(entry.branchName).toBe("feature/x");
        expect(entry.commitCount).toBe(3);
    });
    it("should include metadata", async () => {
        const { createLogEntry } = await import("../../src/logger/log-entry.js");
        const entry = createLogEntry("token_usage", "info", "Tokens used", {}, {
            inputTokens: 100,
            outputTokens: 50,
        });
        expect(entry.metadata).toEqual({ inputTokens: 100, outputTokens: 50 });
    });
    it("should survive JSON round-trip", async () => {
        const { createLogEntry } = await import("../../src/logger/log-entry.js");
        const entry = createLogEntry("test", "error", "Test message", {
            runId: "r1",
            iteration: 1,
        }, { key: "value" });
        const roundTripped = JSON.parse(JSON.stringify(entry));
        expect(roundTripped).toEqual(entry);
    });
});
//# sourceMappingURL=log-entry.test.js.map