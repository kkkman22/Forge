import { describe, expect, it, vi } from "vitest";
function makeEntry(level, event, message) {
    return {
        timestamp: "2026-04-29T10:00:00.000Z",
        level,
        event,
        message,
    };
}
describe("formatAsJson", () => {
    it("should format LogEntry as single-line JSON", async () => {
        const { formatAsJson } = await import("../../src/logger/log-sink.js");
        const entry = makeEntry("info", "test", "hello");
        const result = formatAsJson(entry);
        expect(result).toBe(JSON.stringify(entry));
        expect(result).not.toContain("\n");
    });
});
describe("formatAsText", () => {
    it("should format LogEntry as human-readable text", async () => {
        const { formatAsText } = await import("../../src/logger/log-sink.js");
        const entry = makeEntry("info", "iteration_start", "Iteration started");
        const result = formatAsText(entry);
        expect(result).toContain("iteration_start");
        expect(result).toContain("Iteration started");
    });
});
describe("shouldLog", () => {
    it("should allow equal level", async () => {
        const { shouldLog } = await import("../../src/logger/log-sink.js");
        expect(shouldLog("info", "info")).toBe(true);
    });
    it("should allow higher level", async () => {
        const { shouldLog } = await import("../../src/logger/log-sink.js");
        expect(shouldLog("warn", "info")).toBe(true);
        expect(shouldLog("error", "debug")).toBe(true);
    });
    it("should suppress lower level", async () => {
        const { shouldLog } = await import("../../src/logger/log-sink.js");
        expect(shouldLog("debug", "info")).toBe(false);
        expect(shouldLog("info", "warn")).toBe(false);
        expect(shouldLog("warn", "error")).toBe(false);
    });
});
describe("createDualSink", () => {
    it("should call both primary and secondary sinks for each log entry", async () => {
        const { createLogSink, createDualSink } = await import("../../src/logger/log-sink.js");
        const primaryOutput = vi.fn();
        const secondaryOutput = vi.fn();
        const primary = createLogSink({ format: "json", level: "debug" }, primaryOutput);
        const secondary = createLogSink({ format: "json", level: "debug" }, secondaryOutput);
        const dual = createDualSink(primary, secondary);
        const entry = makeEntry("info", "test_event", "test message");
        dual.log(entry);
        expect(primaryOutput).toHaveBeenCalledTimes(1);
        expect(secondaryOutput).toHaveBeenCalledTimes(1);
        // Both should receive the same formatted output
        expect(primaryOutput.mock.calls[0][0]).toBe(secondaryOutput.mock.calls[0][0]);
    });
    it("should not affect primary sink when secondary sink throws", async () => {
        const { createLogSink, createDualSink } = await import("../../src/logger/log-sink.js");
        const primaryOutput = vi.fn();
        const failingOutput = vi.fn(() => {
            throw new Error("disk full");
        });
        const primary = createLogSink({ format: "json", level: "debug" }, primaryOutput);
        const secondary = createLogSink({ format: "json", level: "debug" }, failingOutput);
        const dual = createDualSink(primary, secondary);
        // Suppress stderr output during test
        const stderrSpy = vi.spyOn(console, "error").mockImplementation(() => { });
        const entry = makeEntry("info", "test_event", "test message");
        dual.log(entry);
        // Primary should still be called successfully
        expect(primaryOutput).toHaveBeenCalledTimes(1);
        // Secondary was called but threw
        expect(failingOutput).toHaveBeenCalledTimes(1);
        // stderr warning should have been emitted
        expect(stderrSpy).toHaveBeenCalledTimes(1);
        expect(stderrSpy.mock.calls[0][0]).toContain("Secondary log sink failed");
        expect(stderrSpy.mock.calls[0][0]).toContain("disk full");
        stderrSpy.mockRestore();
    });
    it("should respect log level filtering from primary sink config", async () => {
        const { createLogSink, createDualSink } = await import("../../src/logger/log-sink.js");
        const primaryOutput = vi.fn();
        const secondaryOutput = vi.fn();
        // Primary filters at warn level, secondary at debug level
        const primary = createLogSink({ format: "json", level: "warn" }, primaryOutput);
        const secondary = createLogSink({ format: "json", level: "debug" }, secondaryOutput);
        const dual = createDualSink(primary, secondary);
        // Info entry: primary filters it out, secondary accepts it
        const infoEntry = makeEntry("info", "test_event", "info message");
        dual.log(infoEntry);
        // Each sink applies its own filtering independently
        expect(primaryOutput).toHaveBeenCalledTimes(0);
        expect(secondaryOutput).toHaveBeenCalledTimes(1);
    });
    it("should return primary sink config from getConfig()", async () => {
        const { createLogSink, createDualSink } = await import("../../src/logger/log-sink.js");
        const primary = createLogSink({ format: "text", level: "info" });
        const secondary = createLogSink({ format: "json", level: "debug" });
        const dual = createDualSink(primary, secondary);
        expect(dual.getConfig()).toEqual({ format: "text", level: "info" });
    });
});
//# sourceMappingURL=log-sink.test.js.map