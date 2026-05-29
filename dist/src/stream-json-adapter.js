import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------
export class BackpressureUnrelievedError extends Error {
    elapsedMs;
    constructor(elapsedMs) {
        super(`Backpressure unrelieved for ${elapsedMs}ms`);
        this.elapsedMs = elapsedMs;
        this.name = "BackpressureUnrelievedError";
    }
}
export class LineTooLargeError extends Error {
    lineLength;
    constructor(lineLength) {
        super(`Line too large: ${lineLength} bytes (max 64 MiB)`);
        this.lineLength = lineLength;
        this.name = "LineTooLargeError";
    }
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
export class StreamJsonAdapter {
    runDir;
    degrader;
    constructor(runDir, options) {
        this.runDir = runDir;
        this.degrader = options?.degrader;
        mkdirSync(runDir, { recursive: true });
    }
    async consume(stdout, stdin) {
        const delivered = [];
        const usage = {
            inputTokens: 0,
            outputTokens: 0,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
        };
        let costUsd = 0;
        let lastEventType = null;
        let hasResult = false;
        // Partial-message buffers (R6.3): keyed by message.id
        const partialBuffers = new Map();
        const deliveredMessageIds = new Set();
        // Backpressure tracking
        let bufferedBytes = 0;
        let backpressureStartedAt = null;
        let lastWarningLoggedAt = null;
        const HIGH_WATERMARK = 16 * 1024 * 1024; // 16 MiB
        const LOW_WATERMARK = 4 * 1024 * 1024; // 4 MiB
        const WARNING_THRESHOLD = 4 * 1024 * 1024; // 4 MiB
        const WARNING_DURATION = 5000; // 5 seconds continuous
        const MAX_BACKPRESSURE_MS = 60000; // 60 seconds
        const MAX_LINE_BYTES = 64 * 1024 * 1024; // 64 MiB
        let stdinPaused = false;
        // Backpressure check logic — shared between inline checks and setInterval
        const checkBackpressure = () => {
            if (bufferedBytes > WARNING_THRESHOLD) {
                const now = Date.now();
                if (backpressureStartedAt === null) {
                    backpressureStartedAt = now;
                    lastWarningLoggedAt = null;
                }
                const elapsed = now - backpressureStartedAt;
                // 60s unrelieved -> throw
                if (elapsed >= MAX_BACKPRESSURE_MS) {
                    throw new BackpressureUnrelievedError(elapsed);
                }
                // 5s sustained -> log warning (at most once per second)
                if (elapsed >= WARNING_DURATION) {
                    if (lastWarningLoggedAt === null || now - lastWarningLoggedAt >= 1000) {
                        const entry = {
                            buffer_bytes: bufferedBytes,
                            elapsed_ms: elapsed,
                            timestamp: new Date().toISOString(),
                        };
                        appendFileSync(join(this.runDir, "backpressure.jsonl"), `${JSON.stringify(entry)}\n`, "utf-8");
                        lastWarningLoggedAt = now;
                    }
                }
                // High watermark -> pause stdin
                if (stdin?.pause && !stdinPaused && bufferedBytes > HIGH_WATERMARK) {
                    stdin.pause();
                    stdinPaused = true;
                }
            }
            else {
                // Below threshold -> reset backpressure timer
                backpressureStartedAt = null;
                lastWarningLoggedAt = null;
                // Low watermark -> resume stdin
                if (stdin?.resume && stdinPaused && bufferedBytes < LOW_WATERMARK) {
                    stdin.resume();
                    stdinPaused = false;
                }
            }
        };
        // Monitoring interval (1s)
        const monitorInterval = setInterval(() => {
            try {
                checkBackpressure();
            }
            catch {
                // Errors from setInterval are logged but not propagated to the for-await loop.
                // The inline check will catch the same condition on the next line.
                // For BackpressureUnrelievedError, we destroy the stream to unblock the for-await.
                stdout.destroy();
            }
        }, 1000);
        try {
            const rl = createInterface({ input: stdout, crlfDelay: Infinity });
            for await (const line of rl) {
                if (!line.trim())
                    continue;
                // Line size check (before JSON.parse)
                if (line.length > MAX_LINE_BYTES) {
                    throw new LineTooLargeError(line.length);
                }
                // Track buffered bytes — increase when line comes in
                bufferedBytes += line.length + 1; // +1 for newline
                // Inline backpressure check after each line arrives
                checkBackpressure();
                let event;
                try {
                    event = JSON.parse(line);
                }
                catch {
                    this.logParseError(line);
                    bufferedBytes -= line.length + 1;
                    checkBackpressure();
                    continue;
                }
                // After successful parse + processing, decrease buffered bytes
                const lineBytes = line.length + 1;
                lastEventType = event.type;
                // 429 rate-limit detection — degrade concurrency for next spawn
                if ((event.type === "tool_result" || event.type === "result") && this.degrader) {
                    if (event.status_code === 429 || event.subtype === "rate_limit") {
                        this.degrader.on429();
                    }
                }
                if (event.type === "error") {
                    this.logApiError(event);
                    throw new Error(`Stream error: ${event.error?.message ?? "unknown"}`);
                }
                if (HIDDEN_TYPES.has(event.type)) {
                    // R6.3: buffer partials, merge on message_stop
                    const messageId = this.extractMessageId(event);
                    if (messageId) {
                        this.bufferPartial(partialBuffers, messageId, event);
                        if (event.type === "message_stop") {
                            // Already delivered? Dedup.
                            if (deliveredMessageIds.has(messageId)) {
                                this.logDedup(messageId, event);
                            }
                            else {
                                const merged = this.mergeBuffer(partialBuffers.get(messageId));
                                if (merged) {
                                    delivered.push(merged);
                                    deliveredMessageIds.add(messageId);
                                }
                            }
                            partialBuffers.delete(messageId);
                        }
                    }
                    bufferedBytes -= lineBytes;
                    checkBackpressure();
                    continue;
                }
                if (event.type === "result") {
                    hasResult = true;
                    const u = event.usage;
                    if (typeof u === "object" && u !== null) {
                        const usageObj = u;
                        usage.inputTokens += usageObj.input_tokens ?? 0;
                        usage.outputTokens += usageObj.output_tokens ?? 0;
                        usage.cacheCreationTokens += usageObj.cache_creation_input_tokens ?? 0;
                        usage.cacheReadTokens += usageObj.cache_read_input_tokens ?? 0;
                    }
                    if (typeof event.cost_usd === "number") {
                        costUsd = event.cost_usd;
                    }
                }
                if (!EXPOSED_TYPES.has(event.type) && !HIDDEN_TYPES.has(event.type)) {
                    this.logUnknownEvent(event);
                }
                // Dedup exposed assistant/user messages by message.id
                const eventMessageId = this.extractMessageId(event);
                if (eventMessageId && deliveredMessageIds.has(eventMessageId)) {
                    this.logDedup(eventMessageId, event);
                    bufferedBytes -= lineBytes;
                    checkBackpressure();
                    continue;
                }
                if (eventMessageId) {
                    deliveredMessageIds.add(eventMessageId);
                }
                delivered.push(event);
                bufferedBytes -= lineBytes;
                checkBackpressure();
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
        finally {
            clearInterval(monitorInterval);
        }
    }
    extractMessageId(event) {
        const msg = event.message;
        if (msg?.id)
            return msg.id;
        if (typeof event.id === "string")
            return event.id;
        return null;
    }
    bufferPartial(buffers, messageId, event) {
        let bucket = buffers.get(messageId);
        if (!bucket) {
            bucket = { content_blocks: new Map(), deltas: [] };
            buffers.set(messageId, bucket);
        }
        if (event.type === "message_start") {
            bucket.message_start = event.message;
        }
        else if (event.type === "content_block_start") {
            const idx = event.index ?? 0;
            bucket.content_blocks.set(idx, event.content_block ?? {});
        }
        else if (event.type === "content_block_delta") {
            const idx = event.index ?? 0;
            const existing = bucket.content_blocks.get(idx) ?? {};
            const delta = event.delta;
            if (delta?.type === "text_delta" && typeof delta.text === "string") {
                const prevText = existing.text ?? "";
                existing.text = prevText + delta.text;
                existing.type = existing.type ?? "text";
            }
            else if (delta) {
                Object.assign(existing, delta);
            }
            bucket.content_blocks.set(idx, existing);
        }
        else if (event.type === "message_delta") {
            bucket.deltas.push(event.delta ?? {});
        }
    }
    mergeBuffer(bucket) {
        if (!bucket?.message_start)
            return null;
        const indexes = Array.from(bucket.content_blocks.keys()).sort((a, b) => a - b);
        const content = indexes.map((i) => bucket.content_blocks.get(i)).filter(Boolean);
        const merged = {
            type: "assistant",
            message: {
                ...bucket.message_start,
                content,
            },
        };
        if (bucket.deltas.length > 0) {
            const finalDelta = Object.assign({}, ...bucket.deltas);
            Object.assign(merged.message, finalDelta);
        }
        return merged;
    }
    logParseError(rawLine) {
        const entry = {
            raw_line: rawLine.slice(0, 1024),
            error_message: "JSON parse failed",
            timestamp: new Date().toISOString(),
        };
        appendFileSync(join(this.runDir, "parse-errors.jsonl"), `${JSON.stringify(entry)}\n`, "utf-8");
    }
    logApiError(event) {
        appendFileSync(join(this.runDir, "api-errors.jsonl"), `${JSON.stringify(event)}\n`, "utf-8");
    }
    logUnknownEvent(event) {
        appendFileSync(join(this.runDir, "unknown-events.jsonl"), `${JSON.stringify(event)}\n`, "utf-8");
    }
    logDedup(messageId, event) {
        const entry = {
            message_id: messageId,
            event_type: event.type,
            timestamp: new Date().toISOString(),
        };
        appendFileSync(join(this.runDir, "dedup.jsonl"), `${JSON.stringify(entry)}\n`, "utf-8");
    }
}
//# sourceMappingURL=stream-json-adapter.js.map