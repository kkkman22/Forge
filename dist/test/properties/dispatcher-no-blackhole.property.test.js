import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dispatch, probeL0Eligibility } from "../../src/workflow-dispatcher.js";
const VALID_LEVELS = new Set(["L0", "L1", "L3"]);
const NUM_RUNS = process.env.CI ? 100 : 1000;
describe("R2.9: dispatcher no-blackhole property", () => {
    let tmpDir;
    beforeEach(() => {
        tmpDir = join(tmpdir(), `bh-prop-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        mkdirSync(tmpDir, { recursive: true });
        mkdirSync(join(tmpDir, ".forge", "runs"), { recursive: true });
        delete process.env.CLAUDE_CODE_WORKFLOWS;
    });
    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
        delete process.env.CLAUDE_CODE_WORKFLOWS;
    });
    function makeCtx(overrides = {}) {
        return {
            subcommand: "review",
            runId: `run-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            sessionId: "sess-bh",
            mode: "interactive",
            forgeRoot: join(tmpDir, ".forge"),
            pluginRoot: tmpDir,
            traceId: "trace_20260606T1437_prop",
            ...overrides,
        };
    }
    it("probeL0Eligibility never returns undefined eligible field", () => {
        fc.assert(fc.property(fc.record({
            subcommand: fc.constantFrom("review", "decide", "learn"),
            mode: fc.constantFrom("interactive", "loop"),
            gateEnabled: fc.boolean(),
        }), ({ subcommand, mode, gateEnabled }) => {
            if (gateEnabled) {
                process.env.CLAUDE_CODE_WORKFLOWS = "1";
            }
            else {
                delete process.env.CLAUDE_CODE_WORKFLOWS;
            }
            const probe = probeL0Eligibility(makeCtx({ subcommand, mode }));
            expect(probe.eligible).toBeDefined();
            expect(typeof probe.eligible).toBe("boolean");
            if (!probe.eligible) {
                expect(probe.reason).toBeDefined();
                expect(typeof probe.reason).toBe("string");
                expect(probe.reason.length).toBeGreaterThan(0);
            }
            delete process.env.CLAUDE_CODE_WORKFLOWS;
        }), { numRuns: NUM_RUNS });
    });
    it("dispatch always selects a valid level — never undefined/null/blackhole", async () => {
        await fc.assert(fc.asyncProperty(fc.record({
            subcommand: fc.constantFrom("review", "decide", "learn"),
            mode: fc.constantFrom("interactive", "loop"),
            gateEnabled: fc.boolean(),
            allFallbacksFailed: fc.boolean(),
            tryL0Fails: fc.boolean(),
            l0ErrorMessage: fc.oneof(fc.constant("bp() exception"), fc.constant("schema validation failed"), fc.constant("subprocess crash"), fc.constant("stuck timeout exceeded"), fc.constant("FrozenZoneViolation"), fc.constant("unknown error")),
        }), async ({ subcommand, mode, gateEnabled, allFallbacksFailed, tryL0Fails, l0ErrorMessage, }) => {
            if (gateEnabled) {
                process.env.CLAUDE_CODE_WORKFLOWS = "1";
            }
            else {
                delete process.env.CLAUDE_CODE_WORKFLOWS;
            }
            const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const ctx = makeCtx({ subcommand, mode, runId });
            const result = await dispatch(ctx, {
                allFallbacksFailed,
                tryL0: tryL0Fails
                    ? async () => {
                        throw new Error(l0ErrorMessage);
                    }
                    : undefined,
                runFallback: async () => allFallbacksFailed ? null : { output: "fb", methodology: "subagent-parallel" },
            });
            expect(result.chosenLevel).toBeDefined();
            expect(result.chosenLevel).not.toBeNull();
            expect(VALID_LEVELS.has(result.chosenLevel)).toBe(true);
            expect(result.record).toBeDefined();
            expect(VALID_LEVELS.has(result.record.chosen_level)).toBe(true);
            delete process.env.CLAUDE_CODE_WORKFLOWS;
        }), { numRuns: NUM_RUNS });
    });
    it("when no explicit conditions match, dispatch tags as unmatched_state or valid L1 reason", async () => {
        delete process.env.CLAUDE_CODE_WORKFLOWS;
        const L1_VALID_REASONS = new Set([
            "gate_disabled",
            "env_unset",
            "non_interactive",
            "workflow_missing",
            "workflow_syntax_error",
            "concurrency_uncontrolled",
            "unmatched_state",
        ]);
        await fc.assert(fc.asyncProperty(fc.record({
            subcommand: fc.constantFrom("review", "decide", "learn"),
            mode: fc.constantFrom("interactive", "loop"),
        }), async ({ subcommand, mode }) => {
            const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const ctx = makeCtx({ subcommand, mode, runId });
            const result = await dispatch(ctx, {
                runFallback: async () => ({ output: "fb", methodology: "subagent-parallel" }),
            });
            expect(result.chosenLevel).toBe("L1");
            expect(result.l1TriggerReason).toBeDefined();
            expect(L1_VALID_REASONS.has(result.l1TriggerReason)).toBe(true);
        }), { numRuns: NUM_RUNS });
    });
    it("allFallbacksFailed always routes to L3 regardless of other state", async () => {
        await fc.assert(fc.asyncProperty(fc.record({
            subcommand: fc.constantFrom("review", "decide", "learn"),
            mode: fc.constantFrom("interactive", "loop"),
            gateEnabled: fc.boolean(),
        }), async ({ subcommand, mode, gateEnabled }) => {
            if (gateEnabled) {
                process.env.CLAUDE_CODE_WORKFLOWS = "1";
            }
            else {
                delete process.env.CLAUDE_CODE_WORKFLOWS;
            }
            const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            const ctx = makeCtx({ subcommand, mode, runId });
            const result = await dispatch(ctx, {
                allFallbacksFailed: true,
                runFallback: async () => null,
            });
            expect(result.chosenLevel).toBe("L3");
            expect(result.result).toBe("blocked");
            delete process.env.CLAUDE_CODE_WORKFLOWS;
        }), { numRuns: NUM_RUNS });
    });
});
//# sourceMappingURL=dispatcher-no-blackhole.property.test.js.map