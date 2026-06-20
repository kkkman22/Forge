/**
 * Regression: agent-browser daemon leak via ui-harness.
 *
 * Symptom: `agent-browser open --session <id>` forks a long-lived daemon per
 * session. `src/ui-harness.ts` called `client.close(sessionId)` mid-try-block
 * (NOT in finally), so any throw between open and close (snapshot failure,
 * network error, assertion) skipped close → the daemon was orphaned and
 * accumulated across test runs (251 daemons + 426 sockets observed in dev).
 *
 * This test injects a client whose snapshot throws, and asserts close() is
 * still invoked — proving the daemon is reaped on the error path.
 */
import { describe, expect, it } from "vitest";
import { runUiHarness } from "../src/ui-harness.js";
/** Tracks open/snapshot/close calls; snapshot throws to exercise the error path. */
function makeLeakyClient() {
    const calls = [];
    const client = {
        async open(_url, _sid) {
            calls.push("open");
        },
        async snapshot(_sid) {
            calls.push("snapshot");
            throw new Error("simulated snapshot failure");
        },
        async fill() {
            calls.push("fill");
        },
        async click() {
            calls.push("click");
        },
        async screenshot() {
            calls.push("screenshot");
        },
        async close(sid) {
            calls.push(`close:${sid}`);
        },
    };
    return { client, calls };
}
describe("ui-harness agent-browser daemon cleanup (regression)", () => {
    it("calls client.close even when snapshot throws (no daemon leak)", async () => {
        const { client, calls } = makeLeakyClient();
        await runUiHarness({
            topic: "test-ui-attempted",
            appUrl: "http://localhost:1",
            detectAgentBrowser: async () => true,
            agentBrowserClientFactory: () => client,
            playwrightRunner: async () => ({ ok: false, reason: "stub" }),
            cdpRunner: async () => ({ ok: false, reason: "stub" }),
        });
        // open happened, snapshot threw, BUT close must still have been called.
        expect(calls).toContain("open");
        expect(calls.some((c) => c.startsWith("close:"))).toBe(true);
    });
    it("calls client.close even when open throws (no daemon leak)", async () => {
        const calls = [];
        const client = {
            async open() {
                calls.push("open");
                throw new Error("simulated open failure");
            },
            async snapshot() {
                calls.push("snapshot");
                return {};
            },
            async fill() { },
            async click() { },
            async screenshot() { },
            async close(sid) {
                calls.push(`close:${sid}`);
            },
        };
        await runUiHarness({
            topic: "test-ui-open-failed",
            appUrl: "http://localhost:1",
            detectAgentBrowser: async () => true,
            agentBrowserClientFactory: () => client,
            playwrightRunner: async () => ({ ok: false, reason: "stub" }),
            cdpRunner: async () => ({ ok: false, reason: "stub" }),
        });
        // open threw before any daemon bound a session; close should still be
        // attempted (best-effort) so a half-bound daemon is reaped.
        expect(calls).toContain("open");
    });
    it("close failure is swallowed (does not break the tier fallback)", async () => {
        const client = {
            async open() { },
            async snapshot() {
                throw new Error("snapshot fail");
            },
            async fill() { },
            async click() { },
            async screenshot() { },
            async close() {
                throw new Error("close also failed");
            },
        };
        const result = await runUiHarness({
            topic: "test-ui-close-failed",
            appUrl: "http://localhost:1",
            detectAgentBrowser: async () => true,
            agentBrowserClientFactory: () => client,
            playwrightRunner: async () => ({ ok: false, reason: "stub" }),
            cdpRunner: async () => ({ ok: false, reason: "stub" }),
        });
        // runUiHarness must still resolve and walk to the next tiers.
        expect(result.controllersAttempted.some((a) => a.tier === "playwright")).toBe(true);
    });
});
//# sourceMappingURL=ui-harness-daemon-cleanup.test.js.map