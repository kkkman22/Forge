import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { IpcEmitter, IPC_SCHEMA_VERSION, SUPPORTED_EVENTS } from "../src/ipc-emitter.js";
import { execSync } from "node:child_process";

describe("T12: Desktop IPC Regression", () => {
  it("IPC schema version is 1 (positive integer)", () => {
    expect(Number.isInteger(IPC_SCHEMA_VERSION)).toBe(true);
    expect(IPC_SCHEMA_VERSION).toBeGreaterThan(0);
  });

  it("all required IPC events are in SUPPORTED_EVENTS", () => {
    const required = [
      "forge_loop_run_started", "iteration_start", "iteration_end",
      "progress", "message", "tool_use", "tool_result",
      "completion", "run_completed", "error", "warning", "version",
    ];
    for (const evt of required) {
      expect(SUPPORTED_EVENTS).toContain(evt);
    }
  });

  it("IpcEmitter frames are valid JSON with required fields", () => {
    const frames: string[] = [];
    const origWrite = process.stdout.write.bind(process.stdout);
    const spy = (data: string | Buffer) => {
      if (typeof data === "string" && data.trim().startsWith("{")) {
        frames.push(data.trim());
      }
      return true;
    };
    process.stdout.write = spy as typeof process.stdout.write;

    const emitter = new IpcEmitter("run-ipc-test");
    emitter.emitVersion();
    emitter.emit({ event: "iteration_start", iteration: 1 });
    emitter.emitError({ code: "test", message: "test error", fatal: true, retryable: false });

    process.stdout.write = origWrite;

    for (const frame of frames) {
      const parsed = JSON.parse(frame);
      expect(parsed).toHaveProperty("event");
      expect(parsed).toHaveProperty("run_id");
      expect(parsed).toHaveProperty("schema");
      expect(parsed).toHaveProperty("ts");
    }
  });
});

describe("diff-ipc-schema script", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `ipc-diff-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("passes when new schema is superset of baseline", () => {
    const baseline = join(tmpDir, "baseline.ndjson");
    const current = join(tmpDir, "current.ndjson");

    writeFileSync(baseline, [
      JSON.stringify({ event: "iteration_start", schema: 1, run_id: "r1", ts: "2026-01-01" }),
    ].join("\n") + "\n");

    writeFileSync(current, [
      JSON.stringify({ event: "iteration_start", schema: 1, run_id: "r2", ts: "2026-01-02", extra_field: true }),
      JSON.stringify({ event: "new_event", schema: 1, run_id: "r2", ts: "2026-01-02" }),
    ].join("\n") + "\n");

    const result = execSync(`node scripts/diff-ipc-schema.mjs "${baseline}" "${current}"`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    expect(result).toContain("OK");
  });

  it("fails when baseline field is missing in new schema", () => {
    const baseline = join(tmpDir, "baseline.ndjson");
    const current = join(tmpDir, "current.ndjson");

    writeFileSync(baseline, [
      JSON.stringify({ event: "iteration_start", run_id: "r1", important_field: 42 }),
    ].join("\n") + "\n");

    writeFileSync(current, [
      JSON.stringify({ event: "iteration_start", run_id: "r2" }),
    ].join("\n") + "\n");

    expect(() => {
      execSync(`node scripts/diff-ipc-schema.mjs "${baseline}" "${current}"`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    }).toThrow();
  });
});
