/**
 * Unit and property tests for MockAgentAdapter.
 *
 * Covers:
 *   - Property 3: response sequence ordering and loop cycling
 *   - Unit: delay simulation, sequence exhaustion, abort signal handling
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { MockAgentAdapter } from "../src/mock-agent-adapter.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function buildOutput(summary) {
    return {
        success: true,
        summary,
        key_changes_made: [],
        key_learnings: [],
    };
}
// ---------------------------------------------------------------------------
// Property 3: response sequence ordering and loop cycling
// ---------------------------------------------------------------------------
describe("Feature: multi-platform-support, Property 3: response sequence", () => {
    it("returns responses in order and cycles when loop is enabled", async () => {
        await fc.assert(fc.asyncProperty(fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 1, maxLength: 10 }), fc.integer({ min: 1, max: 50 }), fc.boolean(), async (summaries, callCount, loop) => {
            const responses = summaries.map((s) => ({ output: buildOutput(s) }));
            const adapter = new MockAgentAdapter({
                cwd: "/tmp",
                responses,
                loop,
            });
            for (let i = 0; i < callCount; i++) {
                if (!loop && i >= responses.length) {
                    await expect(adapter.run("prompt", "/tmp")).rejects.toThrow(/exhausted/);
                    return;
                }
                const result = await adapter.run("prompt", "/tmp");
                const idx = loop ? i % responses.length : i;
                expect(result.output.summary).toBe(summaries[idx]);
            }
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------
describe("MockAgentAdapter unit tests", () => {
    it("returns responses in order", async () => {
        const adapter = new MockAgentAdapter({
            cwd: "/tmp",
            responses: [
                { output: buildOutput("first") },
                { output: buildOutput("second") },
                { output: buildOutput("third") },
            ],
        });
        const r1 = await adapter.run("p", "/tmp");
        expect(r1.output.summary).toBe("first");
        const r2 = await adapter.run("p", "/tmp");
        expect(r2.output.summary).toBe("second");
        const r3 = await adapter.run("p", "/tmp");
        expect(r3.output.summary).toBe("third");
    });
    it("cycles when loop is enabled", async () => {
        const adapter = new MockAgentAdapter({
            cwd: "/tmp",
            responses: [{ output: buildOutput("A") }, { output: buildOutput("B") }],
            loop: true,
        });
        expect((await adapter.run("p", "/tmp")).output.summary).toBe("A");
        expect((await adapter.run("p", "/tmp")).output.summary).toBe("B");
        expect((await adapter.run("p", "/tmp")).output.summary).toBe("A");
        expect((await adapter.run("p", "/tmp")).output.summary).toBe("B");
    });
    it("throws when sequence is exhausted without loop", async () => {
        const adapter = new MockAgentAdapter({
            cwd: "/tmp",
            responses: [{ output: buildOutput("only") }],
        });
        await adapter.run("p", "/tmp");
        await expect(adapter.run("p", "/tmp")).rejects.toThrow(/exhausted/);
    });
    it("simulates delay when configured", async () => {
        const adapter = new MockAgentAdapter({
            cwd: "/tmp",
            responses: [{ output: buildOutput("delayed") }],
            delayMs: 50,
        });
        const start = Date.now();
        await adapter.run("p", "/tmp");
        const elapsed = Date.now() - start;
        expect(elapsed).toBeGreaterThanOrEqual(45);
    });
    it("throws when aborted before run", async () => {
        const adapter = new MockAgentAdapter({
            cwd: "/tmp",
            responses: [{ output: buildOutput("x") }],
        });
        const controller = new AbortController();
        controller.abort("test abort");
        await expect(adapter.run("p", "/tmp", { signal: controller.signal })).rejects.toThrow(/aborted/);
    });
    it("throws when aborted during delay", async () => {
        const adapter = new MockAgentAdapter({
            cwd: "/tmp",
            responses: [{ output: buildOutput("x") }],
            delayMs: 100,
        });
        const controller = new AbortController();
        const runPromise = adapter.run("p", "/tmp", { signal: controller.signal });
        setTimeout(() => controller.abort("mid-delay abort"), 10);
        await expect(runPromise).rejects.toThrow(/aborted/);
    });
    it("throws when no responses are configured", async () => {
        const adapter = new MockAgentAdapter({ cwd: "/tmp", responses: [] });
        await expect(adapter.run("p", "/tmp")).rejects.toThrow(/no responses/);
    });
    it("close is a no-op", () => {
        const adapter = new MockAgentAdapter({
            cwd: "/tmp",
            responses: [{ output: buildOutput("x") }],
        });
        expect(() => adapter.close()).not.toThrow();
    });
});
//# sourceMappingURL=mock-agent-adapter.test.js.map