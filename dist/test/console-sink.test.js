/**
 * Tests for ConsoleSink — the unified console output exit point.
 *
 * **Validates: v2.4 Requirement 6.3, 6.4**
 */
import { describe, expect, it, vi } from "vitest";
import { createConsoleSink } from "../src/logger/console-sink.js";
import { createLogEntry } from "../src/logger/index.js";
describe("ConsoleSink", () => {
    it("writes info entries to stdout", () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => { });
        const sink = createConsoleSink({ format: "text" });
        const entry = createLogEntry("test_event", "info", "hello", {});
        sink.write(entry);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0]).toContain("test_event");
        spy.mockRestore();
    });
    it("writes error entries to stderr", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => { });
        const sink = createConsoleSink({ format: "text" });
        const entry = createLogEntry("error_event", "error", "boom", {});
        sink.write(entry);
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy.mock.calls[0][0]).toContain("error_event");
        spy.mockRestore();
    });
    it("writes warn entries to stderr", () => {
        const spy = vi.spyOn(console, "error").mockImplementation(() => { });
        const sink = createConsoleSink({ format: "text" });
        const entry = createLogEntry("warn_event", "warn", "careful", {});
        sink.write(entry);
        expect(spy).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });
    it("suppresses entries below minLevel", () => {
        const logSpy = vi.spyOn(console, "log").mockImplementation(() => { });
        const errSpy = vi.spyOn(console, "error").mockImplementation(() => { });
        const sink = createConsoleSink({ format: "text", minLevel: "warn" });
        const debugEntry = createLogEntry("debug_event", "debug", "invisible", {});
        sink.write(debugEntry);
        expect(logSpy).not.toHaveBeenCalled();
        expect(errSpy).not.toHaveBeenCalled();
        logSpy.mockRestore();
        errSpy.mockRestore();
    });
    it("formats as JSON when format is json", () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => { });
        const sink = createConsoleSink({ format: "json" });
        const entry = createLogEntry("json_event", "info", "data", { runId: "r1" });
        sink.write(entry);
        const output = spy.mock.calls[0][0];
        const parsed = JSON.parse(output);
        expect(parsed.event).toBe("json_event");
        expect(parsed.level).toBe("info");
        spy.mockRestore();
    });
    it("defaults minLevel to info when not specified", () => {
        const spy = vi.spyOn(console, "log").mockImplementation(() => { });
        const sink = createConsoleSink({ format: "text" });
        const debugEntry = createLogEntry("debug_event", "debug", "invisible", {});
        sink.write(debugEntry);
        expect(spy).not.toHaveBeenCalled();
        const infoEntry = createLogEntry("info_event", "info", "visible", {});
        sink.write(infoEntry);
        expect(spy).toHaveBeenCalledTimes(1);
        spy.mockRestore();
    });
});
//# sourceMappingURL=console-sink.test.js.map