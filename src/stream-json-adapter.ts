/**
 * StreamJsonAdapter — parses `claude --print --output-format stream-json --include-partial-messages`
 * NDJSON output and translates events into the existing `loop-types.ts` message
 * structure.
 *
 * See:
 *   - .kiro/specs/workflows-integration/requirements.md §Requirement 6
 *   - .kiro/specs/workflows-integration/design.md §3.x
 */

import { EventEmitter } from "node:events";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const KIB = 1024;
const DEFAULT_MAX_LINE_BYTES = 64 * 1024 * 1024;

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

export class IterationFailedError extends Error {
  constructor(
    public readonly errorType: string,
    public readonly originalMessage: string,
  ) {
    super(`iteration-failed: ${errorType}: ${originalMessage}`);
    this.name = "IterationFailedError";
  }
}

export class LineTooLargeError extends Error {
  constructor(public readonly bytes: number) {
    super(`line exceeds max bytes: ${bytes}`);
    this.name = "LineTooLargeError";
  }
}

export interface StreamJsonAdapterOptions {
  /** Path to .forge/runs/<runId>/ — used for parse-errors.jsonl, etc. */
  runDir: string;
  /** Per-line byte cap; defaults to 64 MiB. */
  maxLineBytes?: number;
}

export interface UsageAccumulator {
  costUsd: number;
  tokensSpent: {
    input: number;
    output: number;
    cacheCreation: number;
    cacheRead: number;
  };
}

interface AdapterEventMap {
  event: (evt: Record<string, unknown>) => void;
  error: (err: Error) => void;
}

export class StreamJsonAdapter extends EventEmitter {
  private buffer = "";
  private readonly runDir: string;
  private readonly maxLineBytes: number;
  private readonly seenMessageIds = new Set<string>();
  private readonly usageMessageIds = new Set<string>();
  private lastEventType: string | null = null;
  private sawResult = false;

  readonly usage: UsageAccumulator = {
    costUsd: 0,
    tokensSpent: { input: 0, output: 0, cacheCreation: 0, cacheRead: 0 },
  };

  constructor(opts: StreamJsonAdapterOptions) {
    super();
    this.runDir = opts.runDir;
    this.maxLineBytes = opts.maxLineBytes ?? DEFAULT_MAX_LINE_BYTES;
  }

  override on<K extends keyof AdapterEventMap>(event: K, listener: AdapterEventMap[K]): this {
    return super.on(event, listener);
  }

  /** Feed a chunk of stdout (potentially mid-line). */
  feed(chunk: string): void {
    this.buffer += chunk;

    // Enforce line cap — even on incomplete buffer.
    if (Buffer.byteLength(this.buffer, "utf-8") > this.maxLineBytes) {
      // If buffer has no newline, the single line itself exceeds cap.
      if (!this.buffer.includes("\n")) {
        const bytes = Buffer.byteLength(this.buffer, "utf-8");
        this.buffer = "";
        throw new LineTooLargeError(bytes);
      }
    }

    let nlIdx: number;
    while ((nlIdx = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, nlIdx);
      this.buffer = this.buffer.slice(nlIdx + 1);
      if (line.trim().length === 0) continue;
      this.processLine(line);
    }
  }

  /** Signal end of subprocess stdout. Synthesizes stream-truncated if needed. */
  endOfStream(): void {
    // Flush any trailing buffered data as one last line.
    if (this.buffer.trim().length > 0) {
      this.processLine(this.buffer);
      this.buffer = "";
    }
    if (!this.sawResult) {
      const truncated = {
        type: "stream-truncated",
        last_event_type: this.lastEventType ?? "<none>",
      };
      this.emit("event", truncated);
    }
  }

  private processLine(line: string): void {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(line);
    } catch (err) {
      this.logJsonl("parse-errors.jsonl", {
        raw_line: line.slice(0, KIB),
        error_message: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const type = String(parsed.type ?? "");
    this.lastEventType = type;

    if (type === "error") {
      this.handleError(parsed);
      return;
    }

    if (HIDDEN_TYPES.has(type)) {
      return;
    }

    if (!EXPOSED_TYPES.has(type)) {
      this.logJsonl("unknown-events.jsonl", {
        raw_event: parsed,
        timestamp: new Date().toISOString(),
      });
      this.emit("event", parsed);
      return;
    }

    // Exposed event. Dedup by message.id when present.
    const messageId = this.extractMessageId(parsed);
    if (messageId) {
      if (this.seenMessageIds.has(messageId)) {
        this.logJsonl("dedup.jsonl", {
          message_id: messageId,
          type,
          timestamp: new Date().toISOString(),
        });
        return;
      }
      this.seenMessageIds.add(messageId);
    }

    this.accumulateUsage(parsed, messageId);

    if (type === "result") {
      this.sawResult = true;
    }

    this.emit("event", parsed);
  }

  private handleError(parsed: Record<string, unknown>): void {
    this.logJsonl("api-errors.jsonl", {
      ...parsed,
      timestamp: new Date().toISOString(),
    });
    const errorObj = (parsed.error ?? {}) as Record<string, unknown>;
    const err = new IterationFailedError(
      String(errorObj.type ?? "unknown"),
      String(errorObj.message ?? ""),
    );
    this.emit("error", err);
  }

  private extractMessageId(parsed: Record<string, unknown>): string | null {
    const msg = parsed.message as Record<string, unknown> | undefined;
    if (msg && typeof msg.id === "string") return msg.id;
    return null;
  }

  private accumulateUsage(parsed: Record<string, unknown>, messageId: string | null): void {
    const msg = parsed.message as Record<string, unknown> | undefined;
    const usage = msg?.usage as Record<string, unknown> | undefined;
    if (!usage) return;
    if (messageId) {
      if (this.usageMessageIds.has(messageId)) return;
      this.usageMessageIds.add(messageId);
    }

    const cost = Number(usage.cost_usd);
    if (Number.isFinite(cost)) {
      this.usage.costUsd += cost;
      return;
    }

    const input = Number(usage.input_tokens) || 0;
    const output = Number(usage.output_tokens) || 0;
    const cacheCreation = Number(usage.cache_creation_input_tokens) || 0;
    const cacheRead = Number(usage.cache_read_input_tokens) || 0;
    this.usage.tokensSpent.input += input;
    this.usage.tokensSpent.output += output;
    this.usage.tokensSpent.cacheCreation += cacheCreation;
    this.usage.tokensSpent.cacheRead += cacheRead;
  }

  private logJsonl(filename: string, record: Record<string, unknown>): void {
    mkdirSync(this.runDir, { recursive: true });
    appendFileSync(join(this.runDir, filename), `${JSON.stringify(record)}\n`);
  }
}
