import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RateLimitDegrader } from "../src/rate-limit-degrader.js";
import { StreamJsonAdapter } from "../src/stream-json-adapter.js";

function linesToStream(lines: string[]): Readable {
  const r = new Readable({ read() {} });
  for (const line of lines) {
    r.push(`${line}\n`);
  }
  r.push(null);
  return r;
}

describe("StreamJsonAdapter 429 detection", () => {
  let runDir: string;
  let toolHealthPath: string;
  const envKey = "FORGE_MAX_PARALLEL_AGENTS_RUNTIME";

  beforeEach(() => {
    runDir = join(tmpdir(), `sja-429-test-${Date.now()}`);
    mkdirSync(runDir, { recursive: true });
    toolHealthPath = join(runDir, "tool-health.md");
    delete process.env[envKey];
  });

  afterEach(() => {
    rmSync(runDir, { recursive: true, force: true });
    delete process.env[envKey];
  });

  // -----------------------------------------------------------------------
  // AC 4.1: 3 tool_result events with status_code=429 → env changes
  // -----------------------------------------------------------------------
  it("degrades concurrency via env var when 429 events are observed", async () => {
    const degrader = new RateLimitDegrader(6, toolHealthPath, "review");
    const adapter = new StreamJsonAdapter(runDir, { degrader });

    const events = [
      JSON.stringify({ type: "tool_result", id: "t1", status_code: 429 }),
      JSON.stringify({ type: "tool_result", id: "t2", status_code: 429 }),
      JSON.stringify({ type: "tool_result", id: "t3", status_code: 429 }),
      JSON.stringify({ type: "result", subtype: "success", result: "done" }),
    ];

    await adapter.consume(linesToStream(events));

    // After 3 429s: 6→3→2→1
    expect(process.env[envKey]).toBe("1");
  });

  // -----------------------------------------------------------------------
  // AC 4.2: current subprocess is NOT killed, just env is set
  // -----------------------------------------------------------------------
  it("does not throw on 429 — only sets env for next spawn", async () => {
    const degrader = new RateLimitDegrader(6, toolHealthPath, "review");
    const adapter = new StreamJsonAdapter(runDir, { degrader });

    const events = [
      JSON.stringify({ type: "tool_result", id: "t1", status_code: 429 }),
      JSON.stringify({ type: "result", subtype: "success", result: "done" }),
    ];

    // Should NOT throw
    const result = await adapter.consume(linesToStream(events));

    // Should still deliver the events
    expect(result.delivered.length).toBe(2);
    expect(result.delivered[0].type).toBe("tool_result");

    // Env should be updated for next spawn
    expect(process.env[envKey]).toBe("3");
  });

  // -----------------------------------------------------------------------
  // AC 4.3: After degrader.reset(), env var is cleared
  // -----------------------------------------------------------------------
  it("clears env var after degrader.reset()", async () => {
    const degrader = new RateLimitDegrader(6, toolHealthPath, "review");
    const adapter = new StreamJsonAdapter(runDir, { degrader });

    const events = [
      JSON.stringify({ type: "tool_result", id: "t1", status_code: 429 }),
      JSON.stringify({ type: "result", subtype: "success", result: "done" }),
    ];

    await adapter.consume(linesToStream(events));
    expect(process.env[envKey]).toBe("3");

    degrader.reset();
    expect(process.env[envKey]).toBeUndefined();
  });

  // -----------------------------------------------------------------------
  // Also detect subtype='rate_limit'
  // -----------------------------------------------------------------------
  it("detects rate_limit subtype as 429 equivalent", async () => {
    const degrader = new RateLimitDegrader(6, toolHealthPath, "review");
    const adapter = new StreamJsonAdapter(runDir, { degrader });

    const events = [
      JSON.stringify({ type: "tool_result", id: "t1", subtype: "rate_limit" }),
      JSON.stringify({ type: "result", subtype: "success", result: "done" }),
    ];

    await adapter.consume(linesToStream(events));
    expect(process.env[envKey]).toBe("3");
  });

  // -----------------------------------------------------------------------
  // No degrader → no 429 detection
  // -----------------------------------------------------------------------
  it("does nothing on 429 events when no degrader is provided", async () => {
    const adapter = new StreamJsonAdapter(runDir);

    const events = [
      JSON.stringify({ type: "tool_result", id: "t1", status_code: 429 }),
      JSON.stringify({ type: "result", subtype: "success", result: "done" }),
    ];

    await adapter.consume(linesToStream(events));
    expect(process.env[envKey]).toBeUndefined();
  });
});
