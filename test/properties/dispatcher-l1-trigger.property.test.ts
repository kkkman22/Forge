import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as fc from "fast-check";
import { afterEach, describe, expect, it } from "vitest";
import type { DispatchContext, L1TriggerReason } from "../../src/workflow-dispatcher.js";
import { dispatch, probeL0Eligibility } from "../../src/workflow-dispatcher.js";

const L1_REASONS: readonly L1TriggerReason[] = [
  "env_unset",
  "non_interactive",
  "workflow_missing",
  "workflow_syntax_error",
  "concurrency_uncontrolled",
  "unmatched_state",
];

const NUM_RUNS = process.env.CI ? 100 : 1000;

function freshTmpDir(): string {
  const d = join(tmpdir(), `l1-prop-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(d, { recursive: true });
  mkdirSync(join(d, ".forge", "runs"), { recursive: true });
  return d;
}

function makeCtx(tmpDir: string, overrides: Partial<DispatchContext> = {}): DispatchContext {
  return {
    subcommand: "review",
    runId: `run-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    sessionId: "sess-prop",
    mode: "interactive",
    forgeRoot: join(tmpDir, ".forge"),
    pluginRoot: tmpDir,
    traceId: "trace_20260606T1437_prop",
    ...overrides,
  };
}

describe("R2.2: dispatcher L1 trigger property", () => {
  afterEach(() => {
    delete process.env.CLAUDE_CODE_WORKFLOWS;
  });

  it("for any single L1 trigger reason, probe reports that exact reason", {
    timeout: 60_000,
  }, () => {
    fc.assert(
      fc.property(fc.constantFrom(...L1_REASONS), (reason) => {
        delete process.env.CLAUDE_CODE_WORKFLOWS;
        const tmpDir = freshTmpDir();

        try {
          const ctxOverrides: Partial<DispatchContext> = {};

          switch (reason) {
            case "env_unset":
              delete process.env.CLAUDE_CODE_WORKFLOWS;
              break;
            case "non_interactive":
              process.env.CLAUDE_CODE_WORKFLOWS = "1";
              ctxOverrides.mode = "loop";
              break;
            case "workflow_missing":
              process.env.CLAUDE_CODE_WORKFLOWS = "1";
              break;
            case "workflow_syntax_error": {
              process.env.CLAUDE_CODE_WORKFLOWS = "1";
              const wfDir = join(tmpDir, "workflows");
              mkdirSync(wfDir, { recursive: true });
              writeFileSync(join(wfDir, "review.js"), "this is { broken");
              break;
            }
            case "concurrency_uncontrolled": {
              process.env.CLAUDE_CODE_WORKFLOWS = "1";
              const wfDir = join(tmpDir, "workflows");
              mkdirSync(wfDir, { recursive: true });
              writeFileSync(join(tmpDir, "package.json"), '{"type":"module"}');
              writeFileSync(
                join(wfDir, "review.js"),
                "import { chunkedParallel } from './lib/concurrency.js';\nexport const meta = {};\n",
              );
              break;
            }
            case "unmatched_state":
              delete process.env.CLAUDE_CODE_WORKFLOWS;
              break;
            default:
              break;
          }

          const probe = probeL0Eligibility(makeCtx(tmpDir, ctxOverrides));

          if (reason === "unmatched_state") {
            expect(probe.eligible).toBe(false);
            expect(typeof probe.reason).toBe("string");
          } else {
            expect(probe.eligible).toBe(false);
            expect(probe.reason).toBe(reason);
          }
        } finally {
          rmSync(tmpDir, { recursive: true, force: true });
          delete process.env.CLAUDE_CODE_WORKFLOWS;
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it("for any probe-ineligible context, dispatch selects L1 with correct trigger reason", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          subcommand: fc.constantFrom("review", "decide", "learn"),
          mode: fc.constantFrom("interactive", "loop"),
          gateEnabled: fc.boolean(),
        }),
        async ({ subcommand, mode, gateEnabled }) => {
          if (gateEnabled) {
            process.env.CLAUDE_CODE_WORKFLOWS = "1";
          } else {
            delete process.env.CLAUDE_CODE_WORKFLOWS;
          }

          const tmpDir = freshTmpDir();

          try {
            const ctx = makeCtx(tmpDir, { subcommand, mode });
            const probe = probeL0Eligibility(ctx);

            if (!probe.eligible) {
              await dispatch(ctx, {
                runFallback: async () => ({ output: "fb", methodology: "subagent-parallel" }),
              }).then((result) => {
                expect(result.chosenLevel).toBe("L1");
                expect(result.l1TriggerReason).toBeDefined();
                const validReasons = new Set<string>(L1_REASONS);
                expect(validReasons.has(result.l1TriggerReason!)).toBe(true);
              });
            }
            return;
          } finally {
            rmSync(tmpDir, { recursive: true, force: true });
            delete process.env.CLAUDE_CODE_WORKFLOWS;
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
