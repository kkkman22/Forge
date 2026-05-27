import { beforeEach, describe, expect, it } from "vitest";
import {
  createIpcEmitter,
  type EmitOptions,
  formatErrorFrame,
  formatVersionFrame,
  formatWarningFrame,
  type IpcEmitter,
  MAX_LINE_BYTES,
  SCHEMA_VERSION,
  SUPPORTED_EVENTS,
} from "../../src/ipc-emitter.js";

let output: string[];

beforeEach(() => {
  output = [];
});

function makeEmitter(opts?: Partial<EmitOptions>): IpcEmitter {
  return createIpcEmitter({
    runId: "run_t7",
    write: (line: string) => output.push(line),
    ...opts,
  });
}

describe("IpcEmitter: AC 8.1 — frame structure", () => {
  it("every emitted line is valid JSON with event/run_id/schema/ts", () => {
    const emitter = makeEmitter();
    emitter.emit("iteration_start", { iteration: 1 });
    emitter.emit("progress", { pct: 0.5 });
    for (const line of output) {
      const obj = JSON.parse(line);
      expect(obj).toHaveProperty("event");
      expect(obj).toHaveProperty("run_id");
      expect(obj).toHaveProperty("schema");
      expect(obj).toHaveProperty("ts");
      expect(obj.run_id).toBe("run_t7");
      expect(typeof obj.schema).toBe("number");
      expect(Date.parse(obj.ts)).not.toBeNaN();
    }
  });

  it("truncates lines exceeding 1024 bytes preserving first 1024 bytes", () => {
    const emitter = makeEmitter();
    const bigPayload = "x".repeat(2000);
    emitter.emit("message", { text: bigPayload });
    expect(output.length).toBe(1);
    const line = output[0]!;
    // Line should be ≤ 1024 bytes (plus newline)
    expect(Buffer.byteLength(line, "utf-8")).toBeLessThanOrEqual(MAX_LINE_BYTES);
    // Truncated content is still valid JSON
    const obj = JSON.parse(line);
    expect(obj.event).toBe("message");
  });
});

describe("IpcEmitter: AC 8.5 — version handshake frame", () => {
  it("formatVersionFrame produces event=version with schema and supported_events", () => {
    const frame = formatVersionFrame("run_t7");
    const obj = JSON.parse(frame);
    expect(obj.event).toBe("version");
    expect(obj.schema).toBe(SCHEMA_VERSION);
    expect(typeof obj.schema).toBe("number");
    expect(obj.schema).toBeGreaterThan(0);
    expect(Array.isArray(obj.supported_events)).toBe(true);
    expect(obj.run_id).toBe("run_t7");
    // All AC 8.1 event types present
    for (const evt of [
      "forge_loop_run_started",
      "iteration_start",
      "iteration_end",
      "progress",
      "message",
      "tool_use",
      "tool_result",
      "completion",
      "run_completed",
      "error",
      "warning",
    ]) {
      expect(obj.supported_events).toContain(evt);
    }
  });
});

describe("IpcEmitter: AC 8.3 — error frame", () => {
  it("formatErrorFrame includes fatal/retryable/code/message/run_id", () => {
    const frame = formatErrorFrame({
      runId: "run_t7",
      code: "subprocess_crash",
      message: "exited with code 137",
      fatal: true,
      retryable: true,
    });
    const obj = JSON.parse(frame);
    expect(obj.event).toBe("error");
    expect(obj.fatal).toBe(true);
    expect(obj.retryable).toBe(true);
    expect(obj.code).toBe("subprocess_crash");
    expect(obj.message).toBe("exited with code 137");
    expect(obj.run_id).toBe("run_t7");
    expect(obj.schema).toBe(SCHEMA_VERSION);
    expect(Date.parse(obj.ts)).not.toBeNaN();
  });

  it("non-retryable fatal error (SIGSEGV)", () => {
    const frame = formatErrorFrame({
      runId: "r1",
      code: "sigsegv",
      message: "signal 11",
      fatal: true,
      retryable: false,
    });
    const obj = JSON.parse(frame);
    expect(obj.fatal).toBe(true);
    expect(obj.retryable).toBe(false);
  });
});

describe("IpcEmitter: AC 8.4 — warning frame", () => {
  it("formatWarningFrame has fatal=false, retryable=false", () => {
    const frame = formatWarningFrame({
      runId: "run_t7",
      code: "unknown_event",
      message: "forward-compat passthrough",
    });
    const obj = JSON.parse(frame);
    expect(obj.event).toBe("warning");
    expect(obj.fatal).toBe(false);
    expect(obj.retryable).toBe(false);
    expect(obj.code).toBe("unknown_event");
  });

  it("subprocess-retry warning includes attempt number", () => {
    const frame = formatWarningFrame({
      runId: "run_t7",
      code: "subprocess-retry",
      message: "retrying iteration",
      attempt: 2,
    });
    const obj = JSON.parse(frame);
    expect(obj.attempt).toBe(2);
  });
});

describe("IpcEmitter: AC 8.7 — partial suppression", () => {
  it("SUPPORTED_EVENTS list does not include partial/message_delta", () => {
    // Partial/message_delta events are hidden by StreamJsonAdapter and never
    // reach the emitter. This guards against accidental future inclusion.
    expect(SUPPORTED_EVENTS).not.toContain("partial");
    expect(SUPPORTED_EVENTS).not.toContain("message_delta");
  });
});
