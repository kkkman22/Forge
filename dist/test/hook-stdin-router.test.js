/**
 * Unit tests for scripts/lib/hook-stdin-router.mjs — stdin-based caller classifier.
 *
 * Validates Property 1 (subagent short-circuit zero-injection),
 * Property 2 (main-agent shouldInject=true), and Property 3 (fail-safe).
 *
 * **6 payload classes** per design.md "Unit Tests" list.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
const SCRIPT_PATH = join(process.cwd(), "scripts", "lib", "hook-stdin-router.mjs");
/**
 * Execute the router module with given stdin payload and return parsed result.
 * We use a small wrapper that imports the module and JSON-serializes the decision.
 */
function runRouter(stdinPayload) {
    try {
        const result = execFileSync("node", [
            "-e",
            `
        import { classifyHookCaller } from "${SCRIPT_PATH}";
        const stdin = process.env._TEST_STDIN;
        let opts = {};
        if (stdin != null) {
          opts = {
            _testStdin: stdin,
            timeoutMs: 1000,
          };
        }
        const d = await classifyHookCaller(opts);
        process.stdout.write(JSON.stringify(d));
      `,
        ], {
            encoding: "utf-8",
            timeout: 5000,
            env: {
                ...process.env,
                _TEST_STDIN: stdinPayload ?? "",
            },
        });
        return JSON.parse(result);
    }
    catch (e) {
        // If the module doesn't exist or crashes, rethrow
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error(`Router execution failed: ${msg}`);
    }
}
describe("hook-stdin-router (classifyHookCaller)", () => {
    const tempDir = "";
    afterEach(() => {
        // No temp dirs needed — router tests are stateless
        void tempDir;
    });
    it("empty stdin (pipe closed) → callerKind 'unknown', shouldSkipForSubagent true", () => {
        const result = runRouter(null);
        expect(result.callerKind).toBe("unknown");
        expect(result.shouldInject).toBe(false);
    });
    it("partial JSON (unclosed brace) → callerKind 'unknown', shouldInject false", () => {
        const result = runRouter('{"hook_event_name": "Session');
        expect(result.callerKind).toBe("unknown");
        expect(result.shouldInject).toBe(false);
    });
    it("valid main-agent JSON (hook_event_name, no agent_id) → callerKind 'main', shouldInject true", () => {
        const result = runRouter(JSON.stringify({
            session_id: "s-main",
            hook_event_name: "UserPromptSubmit",
        }));
        expect(result.callerKind).toBe("main");
        expect(result.shouldInject).toBe(true);
    });
    it("valid subagent JSON (with agent_id) → callerKind 'subagent', shouldInject false, agentType present", () => {
        const result = runRouter(JSON.stringify({
            session_id: "s-sub",
            hook_event_name: "UserPromptSubmit",
            agent_id: "spec-check",
            agent_type: "spec-check",
        }));
        expect(result.callerKind).toBe("subagent");
        expect(result.shouldInject).toBe(false);
        expect(result.agentType).toBe("spec-check");
    });
    it("binary garbage data (JSON.parse throws) → callerKind 'unknown', shouldInject false", () => {
        // Use non-null-byte garbage that's still invalid JSON
        const garbage = "\x01\x80\xab\xcd{not json at all!!!@@##$$";
        const result = runRouter(garbage);
        expect(result.callerKind).toBe("unknown");
        expect(result.shouldInject).toBe(false);
    });
    it(">64KB malicious payload → callerKind 'unknown', shouldInject false", () => {
        // Generate a payload larger than 64KB
        const hugePayload = JSON.stringify({
            hook_event_name: "UserPromptSubmit",
            agent_id: "x".repeat(70000),
        });
        const result = runRouter(hugePayload);
        expect(result.callerKind).toBe("unknown");
        expect(result.shouldInject).toBe(false);
    });
});
//# sourceMappingURL=hook-stdin-router.test.js.map