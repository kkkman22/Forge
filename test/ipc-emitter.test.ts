import { describe, expect, it, vi } from "vitest";
import { IPC_SCHEMA_VERSION, IpcEmitter, SUPPORTED_EVENTS } from "../src/ipc-emitter.js";

describe("IpcEmitter", () => {
  it("emits version frame on construction", () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const emitter = new IpcEmitter("run-001");
    emitter.emitVersion();

    expect(writeSpy).toHaveBeenCalled();
    const output = (writeSpy.mock.calls[0][0] as string).trim();
    const frame = JSON.parse(output);
    expect(frame.event).toBe("version");
    expect(frame.schema).toBe(IPC_SCHEMA_VERSION);
    expect(frame.run_id).toBe("run-001");
    expect(frame.supported_events).toEqual([...SUPPORTED_EVENTS]);
    expect(frame.ts).toBeTruthy();
    writeSpy.mockRestore();
  });

  it("emits frame with all required fields", () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const emitter = new IpcEmitter("run-001");
    emitter.emit({ event: "iteration_start", iteration: 1 });

    const output = (writeSpy.mock.calls[0][0] as string).trim();
    const frame = JSON.parse(output);
    expect(frame.event).toBe("iteration_start");
    expect(frame.run_id).toBe("run-001");
    expect(frame.schema).toBe(IPC_SCHEMA_VERSION);
    expect(frame.ts).toBeTruthy();
    expect(frame.iteration).toBe(1);
    writeSpy.mockRestore();
  });

  it("truncates output to 1024 bytes", () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const emitter = new IpcEmitter("run-001");
    const longData = "x".repeat(2000);
    emitter.emit({ event: "progress", data: longData });

    const output = writeSpy.mock.calls[0][0] as string;
    // Each line should be ≤ 1024 bytes + newline
    const line = output.trim();
    expect(Buffer.byteLength(line, "utf-8")).toBeLessThanOrEqual(1024);
    writeSpy.mockRestore();
  });

  it("emits error frame with correct structure", () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const emitter = new IpcEmitter("run-001");
    emitter.emitError({
      code: "subprocess_crash",
      message: "exit code 137",
      fatal: true,
      retryable: true,
    });

    const output = (writeSpy.mock.calls[0][0] as string).trim();
    const frame = JSON.parse(output);
    expect(frame.event).toBe("error");
    expect(frame.code).toBe("subprocess_crash");
    expect(frame.fatal).toBe(true);
    expect(frame.retryable).toBe(true);
    writeSpy.mockRestore();
  });

  it("emits warning frame with correct structure", () => {
    const writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const emitter = new IpcEmitter("run-001");
    emitter.emitWarning({ code: "subprocess-retry", attempt: 1 });

    const output = (writeSpy.mock.calls[0][0] as string).trim();
    const frame = JSON.parse(output);
    expect(frame.event).toBe("warning");
    expect(frame.code).toBe("subprocess-retry");
    expect(frame.fatal).toBe(false);
    writeSpy.mockRestore();
  });

  it("IPC_SCHEMA_VERSION is a positive integer", () => {
    expect(Number.isInteger(IPC_SCHEMA_VERSION)).toBe(true);
    expect(IPC_SCHEMA_VERSION).toBeGreaterThan(0);
  });

  it("SUPPORTED_EVENTS contains required event types", () => {
    const required = [
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
      "version",
    ];
    for (const event of required) {
      expect(SUPPORTED_EVENTS).toContain(event);
    }
  });
});
