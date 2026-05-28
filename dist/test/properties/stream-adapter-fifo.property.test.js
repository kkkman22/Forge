import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import * as fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import { StreamJsonAdapter } from "../../src/stream-json-adapter.js";
const numRuns = process.env.CI ? 100 : 1000;
const EXPOSED_TYPES = ["system", "assistant", "user", "tool_use", "tool_result", "result"];
const exposedTypeArb = fc.constantFrom(...EXPOSED_TYPES);
const streamEventArb = fc
    .record({
    type: exposedTypeArb,
    run_id: fc.string({ minLength: 1, maxLength: 20 }),
    session_id: fc.uuid(),
    ts: fc.date({ noInvalidDate: true }).map((d) => d.toISOString()),
})
    .chain((base) => {
    switch (base.type) {
        case "result":
            return fc.constant({
                ...base,
                cost_usd: 0,
                usage: {
                    input_tokens: 0,
                    output_tokens: 0,
                    cache_read_input_tokens: 0,
                    cache_creation_input_tokens: 0,
                },
            });
        case "assistant":
            return fc
                .record({
                message: fc.record({
                    id: fc.uuid(),
                    role: fc.constant("assistant"),
                    content: fc.string({ minLength: 1, maxLength: 50 }),
                }),
            })
                .map((msg) => ({ ...base, ...msg }));
        case "user":
            return fc
                .record({
                message: fc.record({
                    id: fc.uuid(),
                    role: fc.constant("user"),
                    content: fc.string({ minLength: 1, maxLength: 50 }),
                }),
            })
                .map((msg) => ({ ...base, ...msg }));
        case "tool_use":
            return fc
                .record({
                id: fc.uuid(),
                name: fc.string({ minLength: 1, maxLength: 20 }),
                input: fc.dictionary(fc.string({ minLength: 1, maxLength: 10 }), fc.string({ maxLength: 20 })),
            })
                .map((tool) => ({ ...base, ...tool }));
        case "tool_result":
            return fc
                .record({
                id: fc.uuid(),
                content: fc.string({ minLength: 0, maxLength: 50 }),
            })
                .map((tool) => ({ ...base, ...tool }));
        default:
            return fc.constant(base);
    }
});
describe("R5.3 + R6.1 stream-adapter FIFO property", () => {
    const tmpDirs = [];
    afterEach(() => {
        for (const d of tmpDirs) {
            rmSync(d, { recursive: true, force: true });
        }
        tmpDirs.length = 0;
    });
    function makeTmp() {
        const d = mkdtempSync(join(tmpdir(), "stream-pbt-"));
        tmpDirs.push(d);
        return d;
    }
    it("exposed events are delivered in FIFO order", async () => {
        await fc.assert(fc.asyncProperty(fc.array(streamEventArb, { minLength: 1, maxLength: 30 }), async (events) => {
            const runDir = makeTmp();
            const adapter = new StreamJsonAdapter(runDir);
            const exposedEvents = events.filter((e) => EXPOSED_TYPES.includes(e.type));
            const uniqueIdEvents = deduplicateByMessageId(exposedEvents);
            const ndjson = `${events.map((e) => JSON.stringify(e)).join("\n")}\n`;
            const stdout = Readable.from([ndjson]);
            const result = await adapter.consume(stdout);
            const deliveredTypes = result.delivered
                .filter((e) => uniqueIdEvents.some((u) => u.type === e.type))
                .map((e) => e.type);
            const inputTypes = uniqueIdEvents.map((e) => e.type);
            expect(isSubsequence(inputTypes, deliveredTypes)).toBe(true);
        }), { numRuns });
    });
    it("every delivered event is valid JSON with required type field", async () => {
        await fc.assert(fc.asyncProperty(fc.array(streamEventArb, { minLength: 1, maxLength: 20 }), async (events) => {
            const runDir = makeTmp();
            const adapter = new StreamJsonAdapter(runDir);
            const ndjson = `${events.map((e) => JSON.stringify(e)).join("\n")}\n`;
            const stdout = Readable.from([ndjson]);
            const result = await adapter.consume(stdout);
            for (const event of result.delivered) {
                const evt = event;
                expect(typeof evt.type).toBe("string");
                expect(evt.type.length).toBeGreaterThan(0);
            }
        }), { numRuns });
    });
    it("result event populates usage with non-negative numbers", async () => {
        await fc.assert(fc.asyncProperty(fc.array(streamEventArb, { minLength: 1, maxLength: 20 }), async (events) => {
            const runDir = makeTmp();
            const adapter = new StreamJsonAdapter(runDir);
            const hasResult = events.some((e) => e.type === "result");
            const ndjson = `${events.map((e) => JSON.stringify(e)).join("\n")}\n`;
            const stdout = Readable.from([ndjson]);
            const result = await adapter.consume(stdout);
            expect(result.usage.inputTokens).toBeGreaterThanOrEqual(0);
            expect(result.usage.outputTokens).toBeGreaterThanOrEqual(0);
            expect(result.usage.cacheReadTokens).toBeGreaterThanOrEqual(0);
            expect(result.usage.cacheCreationTokens).toBeGreaterThanOrEqual(0);
            if (hasResult) {
                expect(result.costUsd).toBeGreaterThanOrEqual(0);
            }
        }), { numRuns });
    });
});
function deduplicateByMessageId(events) {
    const seen = new Set();
    return events.filter((e) => {
        const id = e.message?.id ?? e.id;
        if (!id)
            return true;
        if (seen.has(id))
            return false;
        seen.add(id);
        return true;
    });
}
function isSubsequence(needle, haystack) {
    let hi = 0;
    for (const n of needle) {
        while (hi < haystack.length && haystack[hi] !== n)
            hi++;
        if (hi >= haystack.length)
            return false;
        hi++;
    }
    return true;
}
//# sourceMappingURL=stream-adapter-fifo.property.test.js.map