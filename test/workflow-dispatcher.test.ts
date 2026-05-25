import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import type {
  DispatchContext,
  DispatchRecord,
  L1TriggerReason,
  L0FailureSignature,
} from "../src/workflow-dispatcher.js";
import {
  probeL0Eligibility,
  dispatch,
  writeDispatchRecord,
  updateStatusMd,
  isolatePartialFindings,
  classifyL0Failure,
} from "../src/workflow-dispatcher.js";

describe("WorkflowDispatcher", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `wf-dispatcher-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    mkdirSync(join(tmpDir, ".forge", "runs"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.CLAUDE_CODE_WORKFLOWS;
  });

  function makeCtx(overrides: Partial<DispatchContext> = {}): DispatchContext {
    return {
      subcommand: "review",
      runId: "run-001",
      sessionId: "sess-001",
      mode: "interactive",
      forgeRoot: join(tmpDir, ".forge"),
      pluginRoot: tmpDir,
      ...overrides,
    };
  }

  describe("probeL0Eligibility", () => {
    it("returns eligible when all 5 conditions pass", () => {
      process.env.CLAUDE_CODE_WORKFLOWS = "1";
      const wfDir = join(tmpDir, "workflows");
      mkdirSync(wfDir, { recursive: true });
      writeFileSync(join(wfDir, "review.js"), "export const meta = {};\n");
      mkdirSync(join(wfDir, "lib"), { recursive: true });
      writeFileSync(join(wfDir, "lib", "concurrency.js"), "export const chunkedParallel = () => {};\n");
      writeFileSync(
        join(wfDir, "review.js"),
        "import { chunkedParallel } from './lib/concurrency.js';\nexport const meta = {};\n",
      );

      const result = probeL0Eligibility(makeCtx());
      expect(result.eligible).toBe(true);
      delete process.env.CLAUDE_CODE_WORKFLOWS;
    });

    it("returns ineligible when env unset", () => {
      delete process.env.CLAUDE_CODE_WORKFLOWS;
      const result = probeL0Eligibility(makeCtx());
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe("env_unset");
    });

    it("returns ineligible when mode is loop (non-interactive)", () => {
      process.env.CLAUDE_CODE_WORKFLOWS = "1";
      const result = probeL0Eligibility(makeCtx({ mode: "loop" }));
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe("non_interactive");
      delete process.env.CLAUDE_CODE_WORKFLOWS;
    });

    it("returns ineligible when workflow file missing", () => {
      process.env.CLAUDE_CODE_WORKFLOWS = "1";
      const result = probeL0Eligibility(makeCtx());
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe("workflow_missing");
      delete process.env.CLAUDE_CODE_WORKFLOWS;
    });

    it("returns ineligible when workflow has syntax error", () => {
      process.env.CLAUDE_CODE_WORKFLOWS = "1";
      const wfDir = join(tmpDir, "workflows");
      mkdirSync(wfDir, { recursive: true });
      writeFileSync(join(wfDir, "review.js"), "this is { broken javascript");
      const result = probeL0Eligibility(makeCtx());
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe("workflow_syntax_error");
      delete process.env.CLAUDE_CODE_WORKFLOWS;
    });

    it("returns ineligible when concurrency bridge missing", () => {
      process.env.CLAUDE_CODE_WORKFLOWS = "1";
      const wfDir = join(tmpDir, "workflows");
      mkdirSync(wfDir, { recursive: true });
      writeFileSync(join(wfDir, "review.js"), "export const meta = {};\n");
      const result = probeL0Eligibility(makeCtx());
      expect(result.eligible).toBe(false);
      expect(result.reason).toBe("concurrency_uncontrolled");
      delete process.env.CLAUDE_CODE_WORKFLOWS;
    });
  });

  describe("dispatch", () => {
    it("chooses L1 when not eligible", async () => {
      delete process.env.CLAUDE_CODE_WORKFLOWS;
      const result = await dispatch(makeCtx(), {
        runFallback: vi.fn().mockResolvedValue({ output: "fallback result" }),
      });
      expect(result.chosenLevel).toBe("L1");
      expect(result.l1TriggerReason).toBeTruthy();
    });

    it("chooses L0 then falls back to L1 on runtime failure", async () => {
      process.env.CLAUDE_CODE_WORKFLOWS = "1";
      const wfDir = join(tmpDir, "workflows");
      mkdirSync(wfDir, { recursive: true });
      mkdirSync(join(wfDir, "lib"), { recursive: true });
      writeFileSync(join(wfDir, "lib", "concurrency.js"), "export const chunkedParallel = () => {};\n");
      writeFileSync(
        join(wfDir, "review.js"),
        "import { chunkedParallel } from './lib/concurrency.js';\nexport const meta = {};\n",
      );

      const result = await dispatch(makeCtx(), {
        tryL0: vi.fn().mockRejectedValue(new Error("bp() exception")),
        runFallback: vi.fn().mockResolvedValue({ output: "fallback result", methodology: "workflow-then-subagent" }),
      });
      expect(result.chosenLevel).toBe("L1");
      expect(result.methodology).toBe("workflow-then-subagent");
      delete process.env.CLAUDE_CODE_WORKFLOWS;
    });

    it("chooses L3 when all levels unavailable", async () => {
      delete process.env.CLAUDE_CODE_WORKFLOWS;
      const result = await dispatch(makeCtx(), {
        runFallback: vi.fn().mockResolvedValue(null),
        allFallbacksFailed: true,
      });
      expect(result.chosenLevel).toBe("L3");
      expect(result.result).toBe("blocked");
    });
  });

  describe("writeDispatchRecord", () => {
    it("writes valid JSONL with all required fields", () => {
      const record: DispatchRecord = {
        subcommand: "review",
        mode: "interactive",
        run_id: "run-001",
        session_id: "sess-001",
        workflow_state_id: "wsid_run-001_review_12345",
        workflow_version: "1.0.0",
        gate_enabled: true,
        workflow_available: true,
        chosen_level: "L0",
        exit_code: 0,
        duration_ms: 5000,
        timestamp: new Date().toISOString(),
        frozen_zone_blocked: false,
      };

      const runDir = join(tmpDir, ".forge", "runs", "run-001");
      mkdirSync(runDir, { recursive: true });
      writeDispatchRecord(runDir, record);

      const content = readFileSync(join(runDir, "dispatch.jsonl"), "utf-8").trim();
      const parsed = JSON.parse(content);
      expect(parsed.subcommand).toBe("review");
      expect(parsed.chosen_level).toBe("L0");
      expect(parsed.workflow_state_id).toMatch(/^wsid_/);
    });
  });

  describe("updateStatusMd", () => {
    it("writes 3 dispatch fields to status.md", () => {
      const statusPath = join(tmpDir, ".forge", "status.md");
      writeFileSync(statusPath, "---\ncurrent_task: test\nphase: build\n---\n# Status\n");

      updateStatusMd(statusPath, {
        dispatch_chosen_level: "L0",
        dispatch_subcommand: "review",
        dispatch_run_id: "run-001",
      });

      const updated = readFileSync(statusPath, "utf-8");
      expect(updated).toContain("dispatch_chosen_level: L0");
      expect(updated).toContain("dispatch_subcommand: review");
      expect(updated).toContain("dispatch_run_id: run-001");
    });
  });

  describe("isolatePartialFindings", () => {
    it("writes partial findings to l0-partial dir", () => {
      const runDir = join(tmpDir, ".forge", "runs", "run-001");
      mkdirSync(runDir, { recursive: true });

      isolatePartialFindings(runDir, "review", "finding content here");

      const partialDir = join(runDir, "l0-partial");
      expect(existsSync(partialDir)).toBe(true);
      const files = readdirSync(partialDir);
      expect(files.length).toBe(1);
      expect(files[0]).toMatch(/^review-/);
    });
  });

  describe("classifyL0Failure", () => {
    it("classifies bp_exception", () => {
      expect(classifyL0Failure(new Error("bp() threw"))).toBe("bp_exception");
    });

    it("classifies schema_validation_failed", () => {
      expect(classifyL0Failure(new Error("schema validation failed for output"))).toBe(
        "schema_validation_failed",
      );
    });

    it("classifies subprocess_crash", () => {
      expect(classifyL0Failure(new Error("subprocess exited with code 1"))).toBe("subprocess_crash");
    });

    it("classifies stuck_timeout", () => {
      expect(classifyL0Failure(new Error("stuck timeout after 600000ms"))).toBe("stuck_timeout");
    });

    it("classifies frozen_zone_blocked", () => {
      expect(classifyL0Failure(new Error("FrozenZoneViolation: .forge/specs/locked"))).toBe(
        "frozen_zone_blocked",
      );
    });
  });
});
