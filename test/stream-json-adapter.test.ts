import { mkdirSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { StreamJsonAdapter } from "../src/stream-json-adapter.js";

function linesToStream(lines: string[]): Readable {
  const r = new Readable({ read() {} });
  for (const line of lines) {
    r.push(line + "\n");
  }
  r.push(null);
  return r;
}

describe("StreamJsonAdapter", () => {
  let runDir: string;

  beforeEach(() => {
    runDir = join(tmpdir(), `sja-test-${Date.now()}`);
    mkdirSync(runDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(runDir, { recursive: true, force: true });
  });

  it("parses exposed business events and delivers them", async () => {
    const adapter = new StreamJsonAdapter(runDir);
    const events = [
      JSON.stringify({ type: "system", session_id: "s1" }),
      JSON.stringify({ type: "assistant", message: { role: "assistant", content: "hi" } }),
      JSON.stringify({ type: "result", subtype: "success", result: "done" }),
    ];
    const result = await adapter.consume(linesToStream(events));
    expect(result.delivered.length).toBe(3);
    expect(result.delivered[0].type).toBe("system");
    expect(result.delivered[1].type).toBe("assistant");
    expect(result.delivered[2].type).toBe("result");
  });

  it("hides protocol-internal events from delivery", async () => {
    const adapter = new StreamJsonAdapter(runDir);
    const events = [
      JSON.stringify({ type: "message_start", message: { id: "m1" } }),
      JSON.stringify({ type: "message_delta", delta: { stop_reason: "end" } }),
      JSON.stringify({ type: "message_stop", message: { id: "m1" } }),
      JSON.stringify({ type: "ping" }),
      JSON.stringify({ type: "result", subtype: "success" }),
    ];
    const result = await adapter.consume(linesToStream(events));
    // Only the result event should be delivered; hidden types are suppressed
    expect(result.delivered.length).toBe(1);
    expect(result.delivered[0].type).toBe("result");
  });

  it("records parse errors without aborting", async () => {
    const adapter = new StreamJsonAdapter(runDir);
    const events = [
      "not valid json",
      JSON.stringify({ type: "result", subtype: "success" }),
    ];
    const result = await adapter.consume(linesToStream(events));
    expect(result.delivered.length).toBe(1);
    expect(existsSync(join(runDir, "parse-errors.jsonl"))).toBe(true);
  });

  it("throws on error events", async () => {
    const adapter = new StreamJsonAdapter(runDir);
    const events = [
      JSON.stringify({ type: "error", error: { type: "rate_limit", message: "too many requests" } }),
    ];
    await expect(adapter.consume(linesToStream(events))).rejects.toThrow();
    expect(existsSync(join(runDir, "api-errors.jsonl"))).toBe(true);
  });

  it("passes through unknown event types", async () => {
    const adapter = new StreamJsonAdapter(runDir);
    const events = [
      JSON.stringify({ type: "foo_bar_new", data: 123 }),
      JSON.stringify({ type: "result", subtype: "success" }),
    ];
    const result = await adapter.consume(linesToStream(events));
    expect(result.delivered.length).toBe(2);
    expect(result.delivered[0].type).toBe("foo_bar_new");
    expect(existsSync(join(runDir, "unknown-events.jsonl"))).toBe(true);
  });

  it("synthesizes stream-truncated when EOF without result", async () => {
    const adapter = new StreamJsonAdapter(runDir);
    const events = [
      JSON.stringify({ type: "assistant", message: { role: "assistant" } }),
    ];
    const result = await adapter.consume(linesToStream(events));
    const lastDelivered = result.delivered[result.delivered.length - 1];
    expect(lastDelivered.type).toBe("stream-truncated");
  });

  it("accumulates usage from result events", async () => {
    const adapter = new StreamJsonAdapter(runDir);
    const events = [
      JSON.stringify({
        type: "result",
        subtype: "success",
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 10,
          cache_read_input_tokens: 20,
        },
      }),
    ];
    const result = await adapter.consume(linesToStream(events));
    expect(result.usage.inputTokens).toBe(100);
    expect(result.usage.outputTokens).toBe(50);
    expect(result.usage.cacheCreationTokens).toBe(10);
    expect(result.usage.cacheReadTokens).toBe(20);
  });

  it("prefers cost_usd from result when available", async () => {
    const adapter = new StreamJsonAdapter(runDir);
    const events = [
      JSON.stringify({
        type: "result",
        subtype: "success",
        usage: { input_tokens: 100, output_tokens: 50 },
        cost_usd: 0.42,
      }),
    ];
    const result = await adapter.consume(linesToStream(events));
    expect(result.costUsd).toBe(0.42);
  });
});
