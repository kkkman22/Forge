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

interface PartialBucket {
  message_start?: Record<string, unknown>;
  content_blocks: Map<number, Record<string, unknown>>;
  deltas: Record<string, unknown>[];
}

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

    // Partial-message buffers (R6.3): keyed by message.id
    const partialBuffers = new Map<string, PartialBucket>();
    const deliveredMessageIds = new Set<string>();

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
        // R6.3: buffer partials, merge on message_stop
        const messageId = this.extractMessageId(event);
        if (messageId) {
          this.bufferPartial(partialBuffers, messageId, event);
          if (event.type === "message_stop") {
            // Already delivered? Dedup.
            if (deliveredMessageIds.has(messageId)) {
              this.logDedup(messageId, event);
            } else {
              const merged = this.mergeBuffer(partialBuffers.get(messageId));
              if (merged) {
                delivered.push(merged);
                deliveredMessageIds.add(messageId);
              }
            }
            partialBuffers.delete(messageId);
          }
        }
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

      // Dedup exposed assistant/user messages by message.id
      const eventMessageId = this.extractMessageId(event);
      if (eventMessageId && deliveredMessageIds.has(eventMessageId)) {
        this.logDedup(eventMessageId, event);
        continue;
      }
      if (eventMessageId) {
        deliveredMessageIds.add(eventMessageId);
      }
      delivered.push(event);
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

  private extractMessageId(event: Record<string, unknown>): string | null {
    // message_start has top-level message.id; other partial events nest similarly
    const msg = event.message as { id?: string } | undefined;
    if (msg?.id) return msg.id;
    if (typeof event.id === "string") return event.id;
    return null;
  }

  private bufferPartial(
    buffers: Map<string, PartialBucket>,
    messageId: string,
    event: Record<string, unknown>,
  ): void {
    let bucket = buffers.get(messageId);
    if (!bucket) {
      bucket = { content_blocks: new Map(), deltas: [] };
      buffers.set(messageId, bucket);
    }
    if (event.type === "message_start") {
      bucket.message_start = event.message as Record<string, unknown> | undefined;
    } else if (event.type === "content_block_start") {
      const idx = (event.index as number | undefined) ?? 0;
      bucket.content_blocks.set(idx, (event.content_block as Record<string, unknown>) ?? {});
    } else if (event.type === "content_block_delta") {
      const idx = (event.index as number | undefined) ?? 0;
      const existing = bucket.content_blocks.get(idx) ?? {};
      const delta = event.delta as Record<string, unknown> | undefined;
      // Merge text deltas onto existing block
      if (delta?.type === "text_delta" && typeof delta.text === "string") {
        const prevText = (existing.text as string | undefined) ?? "";
        existing.text = prevText + delta.text;
        existing.type = existing.type ?? "text";
      } else if (delta) {
        Object.assign(existing, delta);
      }
      bucket.content_blocks.set(idx, existing);
    } else if (event.type === "message_delta") {
      bucket.deltas.push((event.delta as Record<string, unknown>) ?? {});
    }
    // content_block_stop, message_stop, ping: no-op for accumulation
  }

  private mergeBuffer(bucket: PartialBucket | undefined): Record<string, unknown> | null {
    if (!bucket?.message_start) return null;
    const indexes = Array.from(bucket.content_blocks.keys()).sort((a, b) => a - b);
    const content = indexes.map((i) => bucket.content_blocks.get(i)).filter(Boolean);
    const merged: Record<string, unknown> = {
      type: "assistant",
      message: {
        ...bucket.message_start,
        content,
      },
    };
    // Apply message_delta accumulated fields (e.g., stop_reason)
    if (bucket.deltas.length > 0) {
      const finalDelta = Object.assign({}, ...bucket.deltas);
      Object.assign(merged.message as Record<string, unknown>, finalDelta);
    }
    return merged;
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

  private logDedup(messageId: string, event: Record<string, unknown>): void {
    const entry = {
      message_id: messageId,
      event_type: event.type,
      timestamp: new Date().toISOString(),
    };
    appendFileSync(join(this.runDir, "dedup.jsonl"), `${JSON.stringify(entry)}\n`, "utf-8");
  }
}
