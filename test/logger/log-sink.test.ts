import { describe, expect, it } from "vitest";
import type { LogEntry, LogLevel } from "../../src/logger/types.js";

function makeEntry(level: LogLevel, event: string, message: string): LogEntry {
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
