import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  IterationFailedError,
  LineTooLargeError,
  StreamJsonAdapter,
} from "../../src/stream-json-adapter.js";

let tmpRunDir: string;

beforeEach(() => {
  const root = mkdtempSync(join(tmpdir(), "stream-json-adapter-"));
  tmpRunDir = join(root, ".forge", "runs", "run_test");
});

afterEach(() => {
  // tmp dirs are not removed; OS reclaims them
});

function makeAdapter(opts?: { maxLineBytes?: number }) {
  return new StreamJsonAdapter({ runDir: tmpRunDir, maxLineBytes: opts?.maxLineBytes });
}

describe("StreamJsonAdapter: AC 6.1 — event classification", () => {
  it("emits exposed business events to consumer (assistant)", () => {
    const adapter = makeAdapter();
    const out: unknown[] = [];
    adapter.on("event", (e) => out.push(e));
    adapter.feed(
      `${JSON.stringify({ type: "assistant", message: { id: "m1", content: "hi" } })}\n`,
    );
    expect(out.some((e: any) => e.type === "assistant")).toBe(true);
  });

  it("does NOT emit hidden protocol events (message_start)", () => {
    const adapter = makeAdapter();
    const out: unknown[] = [];
    adapter.on("event", (e) => out.push(e));
    adapter.feed(`${JSON.stringify({ type: "message_start", message: { id: "m1" } })}\n`);
    expect(out.length).toBe(0);
  });

  it("emits exposed business events: system, user, tool_use, tool_result, result", () => {
    const adapter = makeAdapter();
    const out: any[] = [];
    adapter.on("event", (e) => out.push(e));
    for (const t of ["system", "user", "tool_use", "tool_result", "result"]) {
      adapter.feed(`${JSON.stringify({ type: t })}\n`);
    }
    expect(out.map((e) => e.type).sort()).toEqual([
      "result",
      "system",
      "tool_result",
      "tool_use",
      "user",
    ]);
  });
});

describe("StreamJsonAdapter: AC 6.2 — malformed JSON does not abort", () => {
  it("logs parse errors to .forge/runs/<runId>/parse-errors.jsonl", () => {
    const adapter = makeAdapter();
    const out: unknown[] = [];
    adapter.on("event", (e) => out.push(e));
    adapter.feed(`{not valid json\n${JSON.stringify({ type: "assistant" })}\n`);
    const errPath = join(tmpRunDir, "parse-errors.jsonl");
    expect(existsSync(errPath)).toBe(true);
    const errLine = JSON.parse(readFileSync(errPath, "utf-8").trim().split("\n")[0]!);
    expect(errLine).toMatchObject({
      raw_line: expect.stringContaining("not valid"),
      error_message: expect.any(String),
      timestamp: expect.any(String),
    });
    // Subsequent valid event still emitted.
    expect(out.length).toBe(1);
  });

  it("truncates raw_line at 1 KiB", () => {
    const adapter = makeAdapter();
    const longBad = "x".repeat(2048);
    adapter.feed(`${longBad}\n`);
    const errPath = join(tmpRunDir, "parse-errors.jsonl");
    const line = JSON.parse(readFileSync(errPath, "utf-8").trim().split("\n")[0]!);
    expect(line.raw_line.length).toBeLessThanOrEqual(1024);
  });
});

describe("StreamJsonAdapter: AC 6.3 — partial message dedup by id", () => {
  it("emits a deduped completion when message_stop fires twice for same id", () => {
    const adapter = makeAdapter();
    const emitted: any[] = [];
    adapter.on("event", (e) => emitted.push(e));
    adapter.feed(`${JSON.stringify({ type: "message_start", message: { id: "m1" } })}\n`);
    adapter.feed(
      `${JSON.stringify({ type: "assistant", message: { id: "m1", content: "first" } })}\n`,
    );
    adapter.feed(
      `${JSON.stringify({ type: "assistant", message: { id: "m1", content: "first" } })}\n`,
    );
    const dedupPath = join(tmpRunDir, "dedup.jsonl");
    expect(existsSync(dedupPath)).toBe(true);
    const assistantCount = emitted.filter(
      (e) => e.type === "assistant" && e.message?.id === "m1",
    ).length;
    expect(assistantCount).toBe(1);
  });
});

describe("StreamJsonAdapter: AC 6.4 — usage accumulation", () => {
  it("accumulates cost_usd from result event", () => {
    const adapter = makeAdapter();
    adapter.feed(
      `${JSON.stringify({
        type: "result",
        message: { id: "r1", usage: { input_tokens: 10, output_tokens: 5, cost_usd: 0.0042 } },
      })}\n`,
    );
    expect(adapter.usage.costUsd).toBeCloseTo(0.0042);
  });

  it("falls back to token-based summing when cost_usd missing", () => {
    const adapter = makeAdapter();
    adapter.feed(
      `${JSON.stringify({
        type: "result",
        message: {
          id: "r2",
          usage: { input_tokens: 100, output_tokens: 50, cache_read_input_tokens: 25 },
        },
      })}\n`,
    );
    expect(adapter.usage.tokensSpent.input).toBe(100);
    expect(adapter.usage.tokensSpent.output).toBe(50);
    expect(adapter.usage.tokensSpent.cacheRead).toBe(25);
  });

  it("dedupes usage by message.id (no double-counting partial + final)", () => {
    const adapter = makeAdapter();
    const evt = JSON.stringify({
      type: "result",
      message: { id: "same", usage: { input_tokens: 100, output_tokens: 50 } },
    });
    adapter.feed(`${evt}\n${evt}\n`);
    expect(adapter.usage.tokensSpent.input).toBe(100);
  });
});

describe("StreamJsonAdapter: AC 6.5 — unknown type forward-compat", () => {
  it("passes unknown event type through and logs unknown-events.jsonl", () => {
    const adapter = makeAdapter();
    const out: any[] = [];
    adapter.on("event", (e) => out.push(e));
    adapter.feed(`${JSON.stringify({ type: "future_event", foo: "bar" })}\n`);
    expect(out.some((e) => e.type === "future_event")).toBe(true);
    expect(existsSync(join(tmpRunDir, "unknown-events.jsonl"))).toBe(true);
  });

  it("does NOT log unknown for new fields on known type", () => {
    const adapter = makeAdapter();
    adapter.feed(
      `${JSON.stringify({ type: "assistant", message: { id: "x" }, thinking_blocks: ["..."] })}\n`,
    );
    expect(existsSync(join(tmpRunDir, "unknown-events.jsonl"))).toBe(false);
  });
});

describe("StreamJsonAdapter: AC 6.6 — error event triggers iteration-failed", () => {
  it("throws IterationFailedError on type=error", () => {
    const adapter = makeAdapter();
    let captured: Error | null = null;
    adapter.on("error", (e) => {
      captured = e;
    });
    adapter.feed(
      `${JSON.stringify({ type: "error", error: { type: "rate_limit", message: "429" } })}\n`,
    );
    expect(captured).toBeInstanceOf(IterationFailedError);
    expect(existsSync(join(tmpRunDir, "api-errors.jsonl"))).toBe(true);
  });
});

describe("StreamJsonAdapter: AC 6.7 — line buffering", () => {
  it("merges chunk-boundary-split JSON lines", () => {
    const adapter = makeAdapter();
    const out: any[] = [];
    adapter.on("event", (e) => out.push(e));
    adapter.feed('{"type":"assist');
    adapter.feed('ant","message":{"id":"x"}}\n');
    expect(out.length).toBe(1);
    expect(out[0].type).toBe("assistant");
  });

  it("throws LineTooLargeError when single line exceeds 64 MiB", () => {
    const adapter = makeAdapter({ maxLineBytes: 1024 });
    expect(() => adapter.feed(`${"x".repeat(2048)}`)).toThrow(LineTooLargeError);
  });
});

describe("StreamJsonAdapter: AC 6.8 — EOF without result synthesizes stream-truncated", () => {
  it("emits stream-truncated when EOF arrives before any result event", () => {
    const adapter = makeAdapter();
    const out: any[] = [];
    adapter.on("event", (e) => out.push(e));
    adapter.feed(`${JSON.stringify({ type: "assistant", message: { id: "a" } })}\n`);
    adapter.endOfStream();
    expect(out.some((e) => e.type === "stream-truncated")).toBe(true);
    const truncated = out.find((e) => e.type === "stream-truncated");
    expect(truncated.last_event_type).toBe("assistant");
  });

  it("does NOT synthesize stream-truncated when result event arrived", () => {
    const adapter = makeAdapter();
    const out: any[] = [];
    adapter.on("event", (e) => out.push(e));
    adapter.feed(`${JSON.stringify({ type: "result", message: { id: "r" } })}\n`);
    adapter.endOfStream();
    expect(out.some((e) => e.type === "stream-truncated")).toBe(false);
  });
});
