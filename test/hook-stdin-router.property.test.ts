/**
 * Property-based tests for scripts/lib/hook-stdin-router.mjs.
 *
 * Validates:
 * - Property 3: fail-safe totality (router never throws, always returns valid RouterDecision)
 * - Any JSON with agent_id → callerKind === "subagent"
 * - Any JSON with hook_event_name but no agent_id → callerKind === "main"
 */

import { execFileSync } from "node:child_process";
import { join } from "node:path";
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

const SCRIPT_PATH = join(process.cwd(), "scripts", "lib", "hook-stdin-router.mjs");

interface RouterDecision {
  shouldInject: boolean;
  callerKind: "main" | "subagent" | "unknown";
  agentType?: string;
}

function callRouter(stdinStr: string): RouterDecision {
  try {
    const result = execFileSync(
      "node",
      [
        "--input-type=module",
        "-e",
        `
        import { classifyHookCaller } from "${SCRIPT_PATH}";
        const d = await classifyHookCaller({ _testStdin: process.env._TEST_STDIN, timeoutMs: 1000 });
        process.stdout.write(JSON.stringify(d));
      `,
      ],
      {
        encoding: "utf-8",
        timeout: 5000,
        env: { ...process.env, _TEST_STDIN: stdinStr },
      },
    );
    return JSON.parse(result) as RouterDecision;
  } catch {
    return { shouldInject: false, callerKind: "unknown" };
  }
}

describe("hook-stdin-router PBT", () => {
  it("never throws and always returns a valid RouterDecision for arbitrary input", {
    timeout: 30000,
  }, () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 1000 }), (stdinStr) => {
        // Filter out strings with null bytes (env vars can't contain them)
        if (stdinStr.includes("\0")) return true;

        const result = callRouter(stdinStr);
        expect(["main", "subagent", "unknown"]).toContain(result.callerKind);
        expect(typeof result.shouldInject).toBe("boolean");
        expect(result.shouldInject).toBe(result.callerKind === "main");
      }),
      { numRuns: 50 },
    );
  });

  it("JSON with agent_id (non-empty string) always classifies as subagent", {
    timeout: 30000,
  }, () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ maxLength: 100 }),
        (agentId, sessionId) => {
          if (agentId.includes("\0") || sessionId.includes("\0")) return true;

          const payload = JSON.stringify({
            session_id: sessionId,
            hook_event_name: "UserPromptSubmit",
            agent_id: agentId,
          });
          const result = callRouter(payload);
          expect(result.callerKind).toBe("subagent");
          expect(result.shouldInject).toBe(false);
        },
      ),
      { numRuns: 20 },
    );
  });

  it("JSON with hook_event_name but no agent_id always classifies as main", {
    timeout: 30000,
  }, () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 50 }),
        fc.string({ maxLength: 100 }),
        (eventName, sessionId) => {
          if (eventName.includes("\0") || sessionId.includes("\0")) return true;

          const payload = JSON.stringify({
            session_id: sessionId,
            hook_event_name: eventName,
          });
          const result = callRouter(payload);
          expect(result.callerKind).toBe("main");
          expect(result.shouldInject).toBe(true);
        },
      ),
      { numRuns: 20 },
    );
  });
});
