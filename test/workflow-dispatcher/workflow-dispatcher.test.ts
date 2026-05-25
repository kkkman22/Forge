import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  classifyL0Failure,
  type DispatchContext,
  isolatePartialFindings,
  probeL0Eligibility,
  resolveL1Trigger,
  updateStatusMd,
  writeDispatchRecord,
} from "../../src/workflow-dispatcher.js";

const ORIG_ENV = { ...process.env };

function makeCtx(over: Partial<DispatchContext> = {}): DispatchContext {
  return {
    subcommand: "review",
    runId: "run_test_001",
    sessionId: "sess_test",
    mode: "interactive",
    forgeRoot: "/tmp/.forge",
    pluginRoot: "/tmp/plugin",
    ...over,
  };
}

beforeEach(() => {
  // Reset workflow-related env to a known state per test.
  delete process.env.CLAUDE_CODE_WORKFLOWS;
});

afterEach(() => {
  process.env = { ...ORIG_ENV };
});

describe("workflow-dispatcher: probeL0Eligibility (R2.1)", () => {
  it("returns eligible=true when all 5 conditions pass", () => {
    process.env.CLAUDE_CODE_WORKFLOWS = "1";
    const tmp = mkdtempSync(join(tmpdir(), "wfdisp-"));
    const wfDir = join(tmp, "workflows");
    const libDir = join(wfDir, "lib");
    writeFileSync(join(tmp, "_init"), "");
    require("node:fs").mkdirSync(libDir, { recursive: true });
    writeFileSync(join(libDir, "concurrency.js"), "export const x = 1;\n");
    writeFileSync(
      join(wfDir, "review.js"),
      "import { x } from './lib/concurrency.js';\nexport const meta = {};\n",
    );

    const result = probeL0Eligibility(makeCtx({ pluginRoot: tmp }));
    expect(result.eligible).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("returns eligible=false with reason=env_unset when CLAUDE_CODE_WORKFLOWS not set", () => {
    const result = probeL0Eligibility(makeCtx());
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("env_unset");
  });

  it("returns eligible=false with reason=non_interactive when mode=loop", () => {
    process.env.CLAUDE_CODE_WORKFLOWS = "1";
    const result = probeL0Eligibility(makeCtx({ mode: "loop" }));
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("non_interactive");
  });

  it("returns eligible=false with reason=workflow_missing when workflow file absent", () => {
    process.env.CLAUDE_CODE_WORKFLOWS = "1";
    const tmp = mkdtempSync(join(tmpdir(), "wfdisp-"));
    const result = probeL0Eligibility(makeCtx({ pluginRoot: tmp }));
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("workflow_missing");
  });

  it("returns eligible=false with reason=workflow_syntax_error when node --check fails", () => {
    process.env.CLAUDE_CODE_WORKFLOWS = "1";
    const tmp = mkdtempSync(join(tmpdir(), "wfdisp-"));
    const wfDir = join(tmp, "workflows");
    require("node:fs").mkdirSync(join(wfDir, "lib"), { recursive: true });
    writeFileSync(join(wfDir, "lib", "concurrency.js"), "export const x = 1;\n");
    writeFileSync(join(wfDir, "review.js"), "this is { not valid javascript :::\n");

    const result = probeL0Eligibility(makeCtx({ pluginRoot: tmp }));
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("workflow_syntax_error");
  });

  it("returns eligible=false with reason=concurrency_uncontrolled when concurrency.js missing", () => {
    process.env.CLAUDE_CODE_WORKFLOWS = "1";
    const tmp = mkdtempSync(join(tmpdir(), "wfdisp-"));
    const wfDir = join(tmp, "workflows");
    require("node:fs").mkdirSync(wfDir, { recursive: true });
    writeFileSync(join(wfDir, "review.js"), "export const meta = {};\n");

    const result = probeL0Eligibility(makeCtx({ pluginRoot: tmp }));
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("concurrency_uncontrolled");
  });

  it("returns eligible=false with reason=concurrency_uncontrolled when workflow missing import", () => {
    process.env.CLAUDE_CODE_WORKFLOWS = "1";
    const tmp = mkdtempSync(join(tmpdir(), "wfdisp-"));
    const wfDir = join(tmp, "workflows");
    require("node:fs").mkdirSync(join(wfDir, "lib"), { recursive: true });
    writeFileSync(join(wfDir, "lib", "concurrency.js"), "export const x = 1;\n");
    // Workflow file does NOT import from ./lib/concurrency
    writeFileSync(join(wfDir, "review.js"), "export const meta = {};\n");

    const result = probeL0Eligibility(makeCtx({ pluginRoot: tmp }));
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe("concurrency_uncontrolled");
  });
});

describe("workflow-dispatcher: resolveL1Trigger (R2.2, R2.9)", () => {
  it("returns unmatched_state when no specific reason given", () => {
    expect(resolveL1Trigger(undefined)).toBe("unmatched_state");
  });

  it("propagates the explicit reason verbatim", () => {
    expect(resolveL1Trigger("gate_disabled")).toBe("gate_disabled");
    expect(resolveL1Trigger("workflow_syntax_error")).toBe("workflow_syntax_error");
  });
});

describe("workflow-dispatcher: classifyL0Failure (R2.4)", () => {
  it("classifies bp ReferenceError as bp_exception", () => {
    const err = new ReferenceError("bp is not defined");
    expect(classifyL0Failure(err)).toBe("bp_exception");
  });

  it("classifies generic bp errors as bp_exception", () => {
    const err = new Error("bp() failed in phase review-layers");
    expect(classifyL0Failure(err)).toBe("bp_exception");
  });

  it("classifies schema validation errors as schema_validation_failed", () => {
    const err = new Error("schema validation failed: findings is not array");
    expect(classifyL0Failure(err)).toBe("schema_validation_failed");
  });

  it("classifies subprocess crash as subprocess_crash", () => {
    const err = new Error("workflow subprocess crashed with SIGSEGV");
    expect(classifyL0Failure(err)).toBe("subprocess_crash");
  });

  it("classifies timeout errors as stuck_timeout", () => {
    const err = new Error("stuck timeout: 600s elapsed without stdout");
    expect(classifyL0Failure(err)).toBe("stuck_timeout");
  });

  it("classifies frozen zone errors as frozen_zone_blocked", () => {
    const err = new Error("frozen_zone_blocked: cannot write to locked spec");
    expect(classifyL0Failure(err)).toBe("frozen_zone_blocked");
  });

  it("falls back to bp_exception for unrecognised errors", () => {
    const err = new Error("totally novel error");
    expect(classifyL0Failure(err)).toBe("bp_exception");
  });
});

describe("workflow-dispatcher: writeDispatchRecord (R2.5)", () => {
  it("writes a valid JSON line to .forge/runs/<runId>/dispatch.jsonl", () => {
    const tmp = mkdtempSync(join(tmpdir(), "wfdisp-"));
    const ctx = makeCtx({ forgeRoot: tmp });
    const path = writeDispatchRecord(ctx, {
      subcommand: "review",
      mode: "interactive",
      run_id: ctx.runId,
      session_id: ctx.sessionId,
      workflow_state_id: "wsid_abc123",
      workflow_version: "1.0.0",
      gate_enabled: true,
      workflow_available: true,
      chosen_level: "L0",
      exit_code: 0,
      duration_ms: 1234,
      timestamp: new Date().toISOString(),
      frozen_zone_blocked: false,
    });
    const content = readFileSync(path, "utf-8").trim();
    const parsed = JSON.parse(content);
    expect(parsed.chosen_level).toBe("L0");
    expect(parsed.run_id).toBe(ctx.runId);
    expect(parsed.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("appends rather than overwrites on multiple writes", () => {
    const tmp = mkdtempSync(join(tmpdir(), "wfdisp-"));
    const ctx = makeCtx({ forgeRoot: tmp });
    const baseRecord = {
      subcommand: "review",
      mode: "interactive" as const,
      run_id: ctx.runId,
      session_id: ctx.sessionId,
      workflow_state_id: "wsid_abc",
      workflow_version: "1.0.0",
      gate_enabled: true,
      workflow_available: true,
      exit_code: 0,
      duration_ms: 100,
      timestamp: new Date().toISOString(),
      frozen_zone_blocked: false,
    };
    const path = writeDispatchRecord(ctx, { ...baseRecord, chosen_level: "L0" });
    writeDispatchRecord(ctx, {
      ...baseRecord,
      chosen_level: "L1",
      l1_trigger_reason: "gate_disabled",
    });
    const lines = readFileSync(path, "utf-8").trim().split("\n");
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]!).chosen_level).toBe("L0");
    expect(JSON.parse(lines[1]!).chosen_level).toBe("L1");
  });

  it("creates parent directory if missing (mkdir -p)", () => {
    const tmp = mkdtempSync(join(tmpdir(), "wfdisp-"));
    const ctx = makeCtx({ forgeRoot: join(tmp, "nested", "forge") });
    const path = writeDispatchRecord(ctx, {
      subcommand: "review",
      mode: "interactive",
      run_id: ctx.runId,
      session_id: ctx.sessionId,
      workflow_state_id: "wsid_x",
      workflow_version: "1.0.0",
      gate_enabled: false,
      workflow_available: false,
      chosen_level: "L1",
      l1_trigger_reason: "env_unset",
      exit_code: 0,
      duration_ms: 50,
      timestamp: new Date().toISOString(),
      frozen_zone_blocked: false,
    });
    expect(readFileSync(path, "utf-8").length).toBeGreaterThan(0);
  });
});

describe("workflow-dispatcher: writeDispatchRecord property test (R2.5)", () => {
  it("100 random records all serialize as valid JSON with required fields", () => {
    fc.assert(
      fc.property(
        fc.record({
          mode: fc.constantFrom("interactive", "loop"),
          subcommand: fc.constantFrom("review", "decide", "learn"),
          chosen_level: fc.constantFrom("L0", "L1", "L2", "L3"),
          gate: fc.boolean(),
          available: fc.boolean(),
          exit: fc.integer({ min: -1, max: 255 }),
          duration: fc.integer({ min: 0, max: 600_000 }),
          frozen: fc.boolean(),
        }),
        (input) => {
          const tmp = mkdtempSync(join(tmpdir(), "wfdisp-prop-"));
          const ctx = makeCtx({ forgeRoot: tmp, mode: input.mode, subcommand: input.subcommand });
          const path = writeDispatchRecord(ctx, {
            subcommand: input.subcommand,
            mode: input.mode,
            run_id: ctx.runId,
            session_id: ctx.sessionId,
            workflow_state_id: `wsid_${Math.random().toString(36).slice(2)}`,
            workflow_version: "1.0.0",
            gate_enabled: input.gate,
            workflow_available: input.available,
            chosen_level: input.chosen_level,
            exit_code: input.exit,
            duration_ms: input.duration,
            timestamp: new Date().toISOString(),
            frozen_zone_blocked: input.frozen,
          });
          const lines = readFileSync(path, "utf-8").trim().split("\n");
          for (const line of lines) {
            const obj = JSON.parse(line);
            // Spec-required fields:
            for (const field of [
              "subcommand",
              "mode",
              "run_id",
              "session_id",
              "workflow_state_id",
              "gate_enabled",
              "workflow_available",
              "chosen_level",
              "exit_code",
              "duration_ms",
              "timestamp",
              "frozen_zone_blocked",
            ]) {
              if (!(field in obj)) {
                return false;
              }
            }
            if (!Date.parse(obj.timestamp)) return false;
          }
          return true;
        },
      ),
      { numRuns: 100 },
    );
  });
});

describe("workflow-dispatcher: updateStatusMd (R2.10)", () => {
  it("writes dispatch_chosen_level/subcommand/run_id to .forge/status.md", () => {
    const tmp = mkdtempSync(join(tmpdir(), "wfdisp-"));
    writeFileSync(join(tmp, "status.md"), "# Status\n\ncurrent_task: foo\nphase: build\n");
    const ctx = makeCtx({ forgeRoot: tmp });
    updateStatusMd(ctx, "L0");
    const content = readFileSync(join(tmp, "status.md"), "utf-8");
    expect(content).toContain("dispatch_chosen_level: L0");
    expect(content).toContain("dispatch_subcommand: review");
    expect(content).toContain(`dispatch_run_id: ${ctx.runId}`);
  });

  it("writes <subcommand>-blocked phase when chosen_level=L3", () => {
    const tmp = mkdtempSync(join(tmpdir(), "wfdisp-"));
    writeFileSync(join(tmp, "status.md"), "# Status\n\nphase: build\n");
    const ctx = makeCtx({ forgeRoot: tmp });
    updateStatusMd(ctx, "L3");
    const content = readFileSync(join(tmp, "status.md"), "utf-8");
    expect(content).toContain("phase: review-blocked");
  });

  it("idempotently updates existing dispatch fields without duplicating", () => {
    const tmp = mkdtempSync(join(tmpdir(), "wfdisp-"));
    writeFileSync(
      join(tmp, "status.md"),
      "# Status\n\nphase: build\ndispatch_chosen_level: L0\ndispatch_subcommand: review\ndispatch_run_id: old\n",
    );
    const ctx = makeCtx({ forgeRoot: tmp, runId: "new-run" });
    updateStatusMd(ctx, "L1");
    const content = readFileSync(join(tmp, "status.md"), "utf-8");
    const matches = content.match(/dispatch_chosen_level:/g);
    expect(matches?.length).toBe(1);
    expect(content).toContain("dispatch_chosen_level: L1");
    expect(content).toContain("dispatch_run_id: new-run");
  });
});

describe("workflow-dispatcher: isolatePartialFindings (R2.8)", () => {
  it("writes partial findings to .forge/runs/<runId>/l0-partial/<subcommand>-<ts>.md", () => {
    const tmp = mkdtempSync(join(tmpdir(), "wfdisp-"));
    const ctx = makeCtx({ forgeRoot: tmp });
    const partialPath = isolatePartialFindings(ctx, "## partial finding\nfoo");
    expect(partialPath).toMatch(/\/runs\/run_test_001\/l0-partial\/review-\d+\.md$/);
    expect(readFileSync(partialPath, "utf-8")).toContain("partial finding");
  });

  it("does NOT write to .forge/reviews/ when isolating partial", () => {
    const tmp = mkdtempSync(join(tmpdir(), "wfdisp-"));
    const ctx = makeCtx({ forgeRoot: tmp });
    isolatePartialFindings(ctx, "partial");
    const fs = require("node:fs");
    expect(fs.existsSync(join(tmp, "reviews"))).toBe(false);
  });
});

describe("workflow-dispatcher: AC R2.7 — no mid-step confirmation prompts", () => {
  it("dispatcher source contains no Chinese/English continue-confirmation prompts", () => {
    const path = join(import.meta.dirname, "..", "..", "src", "workflow-dispatcher.ts");
    const source = readFileSync(path, "utf-8");
    expect(source).not.toMatch(/是否继续/);
    expect(source).not.toMatch(/continue\?/i);
    expect(source).not.toMatch(/proceed\?/i);
  });
});

describe("workflow-dispatcher: AC R2.9 — state space exhaustion (no black hole)", () => {
  it("property test: 200 random state vectors all yield L0 or a known L1 reason", () => {
    fc.assert(
      fc.property(
        fc.record({
          mode: fc.constantFrom("interactive", "loop"),
          envSet: fc.boolean(),
          fileExists: fc.boolean(),
          syntaxOk: fc.boolean(),
          concurrencyOk: fc.boolean(),
        }),
        (s) => {
          const tmp = mkdtempSync(join(tmpdir(), "wfdisp-state-"));
          const wfDir = join(tmp, "workflows");
          const fs = require("node:fs");
          fs.mkdirSync(join(wfDir, "lib"), { recursive: true });
          if (s.concurrencyOk) {
            fs.writeFileSync(join(wfDir, "lib", "concurrency.js"), "export const x = 1;\n");
          }
          if (s.fileExists) {
            const body = s.syntaxOk
              ? s.concurrencyOk
                ? "import './lib/concurrency.js';\nexport const meta = {};\n"
                : "export const meta = {};\n"
              : "this is :::: invalid";
            fs.writeFileSync(join(wfDir, "review.js"), body);
          }
          if (s.envSet) {
            process.env.CLAUDE_CODE_WORKFLOWS = "1";
          } else {
            delete process.env.CLAUDE_CODE_WORKFLOWS;
          }
          const result = probeL0Eligibility(makeCtx({ pluginRoot: tmp, mode: s.mode }));
          if (result.eligible) {
            return result.reason === undefined;
          }
          // Reason must be one of the valid enum values.
          return [
            "gate_disabled",
            "env_unset",
            "non_interactive",
            "workflow_missing",
            "workflow_syntax_error",
            "concurrency_uncontrolled",
            "unmatched_state",
          ].includes(result.reason ?? "");
        },
      ),
      { numRuns: 200 },
    );
  });
});
