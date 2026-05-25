import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import type { TokenUsage } from "./loop-types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdapterResult {
  delivered: Array<Record<string, unknown>>;
  usage: TokenUsage;
  costUsd: number;
  lastEventType: string | null;
}

const EXPOSED_TYPES = new Set(["system", "assistant", "user", "tool_use", "tool_result", "result"]);
const HIDDEN_TYPES = new Set([
  "message_start",
  "message_delta",
  "message_stop",
  "content_block_start",
  "content_block_delta",
  "content_block_stop",
  "ping",
]);

// ---------------------------------------------------------------------------
// StreamJsonAdapter
// ---------------------------------------------------------------------------

export class StreamJsonAdapter {
  private runDir: string;

  constructor(runDir: string) {
    this.runDir = runDir;
    mkdirSync(runDir, { recursive: true });
  }

  async consume(stdout: Readable): Promise<AdapterResult> {
    const delivered: Array<Record<string, unknown>> = [];
    const usage: TokenUsage = {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
    };
    let costUsd = 0;
    let lastEventType: string | null = null;
    let hasResult = false;

    const rl = createInterface({ input: stdout, crlfDelay: Infinity });

    for await (const line of rl) {
      if (!line.trim()) continue;

      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line) as Record<string, unknown>;
      } catch {
        this.logParseError(line);
        continue;
      }

      lastEventType = event.type as string;

      if (event.type === "error") {
        this.logApiError(event);
        throw new Error(
          `Stream error: ${(event.error as Record<string, unknown>)?.message ?? "unknown"}`,
        );
      }

      if (HIDDEN_TYPES.has(event.type as string)) {
        continue;
      }

      if (event.type === "result") {
        hasResult = true;
        const u = event.usage;
        if (typeof u === "object" && u !== null) {
          const usageObj = u as Record<string, number>;
          usage.inputTokens += usageObj.input_tokens ?? 0;
          usage.outputTokens += usageObj.output_tokens ?? 0;
          usage.cacheCreationTokens += usageObj.cache_creation_input_tokens ?? 0;
          usage.cacheReadTokens += usageObj.cache_read_input_tokens ?? 0;
        }
        if (typeof event.cost_usd === "number") {
          costUsd = event.cost_usd;
        }
      }

      if (!EXPOSED_TYPES.has(event.type as string) && !HIDDEN_TYPES.has(event.type as string)) {
        this.logUnknownEvent(event);
      }

      if (!HIDDEN_TYPES.has(event.type as string)) {
        delivered.push(event);
      }
    }

    if (!hasResult) {
      delivered.push({
        type: "stream-truncated",
        run_id: delivered[0]?.session_id ?? "unknown",
        last_event_type: lastEventType,
      });
    }

    return { delivered, usage, costUsd, lastEventType };
  }

  private logParseError(rawLine: string): void {
    const entry = {
      raw_line: rawLine.slice(0, 1024),
      error_message: "JSON parse failed",
      timestamp: new Date().toISOString(),
    };
    appendFileSync(join(this.runDir, "parse-errors.jsonl"), `${JSON.stringify(entry)}\n`, "utf-8");
  }

  private logApiError(event: Record<string, unknown>): void {
    appendFileSync(join(this.runDir, "api-errors.jsonl"), `${JSON.stringify(event)}\n`, "utf-8");
  }

  private logUnknownEvent(event: Record<string, unknown>): void {
    appendFileSync(
      join(this.runDir, "unknown-events.jsonl"),
      `${JSON.stringify(event)}\n`,
      "utf-8",
    );
  }
}
