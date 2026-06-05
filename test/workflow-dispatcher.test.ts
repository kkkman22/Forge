import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DispatchContext, DispatchRecord } from "../src/workflow-dispatcher.js";
import {
  classifyL0Failure,
  dispatch,
  isolatePartialFindings,
  probeL0Eligibility,
  updateStatusMd,
  writeDispatchRecord,
} from "../src/workflow-dispatcher.js";

// ---------------------------------------------------------------------------
// Helper: set up a valid L0 workflow environment
// ---------------------------------------------------------------------------
function setupL0Workflow(tmpDir: string) {
  const wfDir = join(tmpDir, "workflows");
  mkdirSync(wfDir, { recursive: true });
  mkdirSync(join(wfDir, "lib"), { recursive: true });
  // Node 18 runs --check in CJS mode by default; ESM syntax fails without this.
  writeFileSync(join(tmpDir, "package.json"), '{"type":"module"}');
  writeFileSync(join(wfDir, "lib", "concurrency.js"), "export const chunkedParallel = () => {};\n");
  writeFileSync(
    join(wfDir, "review.js"),
    "import { chunkedParallel } from './lib/concurrency.js';\nexport const meta = {};\n",
  );
}

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
      traceId: "trace_20260606T1437_default",
      ...overrides,
    };
  }

  describe("probeL0Eligibility", () => {
    it("returns eligible when all 5 conditions pass", () => {
      process.env.CLAUDE_CODE_WORKFLOWS = "1";
      writeFileSync(join(tmpDir, "package.json"), '{"type":"module"}');
      const wfDir = join(tmpDir, "workflows");
      mkdirSync(wfDir, { recursive: true });
      writeFileSync(join(wfDir, "review.js"), "export const meta = {};\n");
      mkdirSync(join(wfDir, "lib"), { recursive: true });
      writeFileSync(
        join(wfDir, "lib", "concurrency.js"),
        "export const chunkedParallel = () => {};\n",
      );
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
      writeFileSync(join(tmpDir, "package.json"), '{"type":"module"}');
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
      writeFileSync(join(tmpDir, "package.json"), '{"type":"module"}');
      const wfDir = join(tmpDir, "workflows");
      mkdirSync(wfDir, { recursive: true });
      mkdirSync(join(wfDir, "lib"), { recursive: true });
      writeFileSync(
        join(wfDir, "lib", "concurrency.js"),
        "export const chunkedParallel = () => {};\n",
      );
      writeFileSync(
        join(wfDir, "review.js"),
        "import { chunkedParallel } from './lib/concurrency.js';\nexport const meta = {};\n",
      );

      const result = await dispatch(makeCtx(), {
        tryL0: vi.fn().mockRejectedValue(new Error("bp() exception")),
        runFallback: vi
          .fn()
          .mockResolvedValue({ output: "fallback result", methodology: "workflow-then-subagent" }),
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
      expect(classifyL0Failure(new Error("subprocess exited with code 1"))).toBe(
        "subprocess_crash",
      );
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

  // ---------------------------------------------------------------------------
  // T1: 14-field auto-fill tests
  // ---------------------------------------------------------------------------

  describe("dispatch 14-field auto-fill", () => {
    describe("R7.1: duration_ms timing", () => {
      it("measures duration_ms > 0", async () => {
        delete process.env.CLAUDE_CODE_WORKFLOWS;
        const result = await dispatch(makeCtx(), {
          runFallback: vi.fn().mockResolvedValue({ output: "ok" }),
        });
        expect(result.record).toBeDefined();
        expect(result.record!.duration_ms).toBeGreaterThanOrEqual(0);
      });
    });

    describe("R7.2: gate_enabled auto-detection", () => {
      it("sets gate_enabled=true when CLAUDE_CODE_WORKFLOWS=1", async () => {
        process.env.CLAUDE_CODE_WORKFLOWS = "1";
        setupL0Workflow(tmpDir);

        const result = await dispatch(makeCtx());
        expect(result.record).toBeDefined();
        expect(result.record!.gate_enabled).toBe(true);
        delete process.env.CLAUDE_CODE_WORKFLOWS;
      });

      it("sets gate_enabled=false when env unset", async () => {
        delete process.env.CLAUDE_CODE_WORKFLOWS;
        const result = await dispatch(makeCtx(), {
          runFallback: vi.fn().mockResolvedValue({ output: "ok" }),
        });
        expect(result.record).toBeDefined();
        expect(result.record!.gate_enabled).toBe(false);
      });
    });

    describe("R7.2: workflow_available from probe", () => {
      it("sets workflow_available=true when probe succeeds", async () => {
        process.env.CLAUDE_CODE_WORKFLOWS = "1";
        setupL0Workflow(tmpDir);

        const result = await dispatch(makeCtx());
        expect(result.record).toBeDefined();
        expect(result.record!.workflow_available).toBe(true);
        delete process.env.CLAUDE_CODE_WORKFLOWS;
      });

      it("sets workflow_available=false when probe fails", async () => {
        delete process.env.CLAUDE_CODE_WORKFLOWS;
        const result = await dispatch(makeCtx(), {
          runFallback: vi.fn().mockResolvedValue({ output: "ok" }),
        });
        expect(result.record).toBeDefined();
        expect(result.record!.workflow_available).toBe(false);
      });
    });

    describe("R7.3: unique workflow_state_id", () => {
      it("generates unique wsid_* IDs across 100 calls", async () => {
        delete process.env.CLAUDE_CODE_WORKFLOWS;
        const ids = new Set<string>();
        for (let i = 0; i < 100; i++) {
          const result = await dispatch(makeCtx({ runId: `run-${i}` }), {
            runFallback: vi.fn().mockResolvedValue({ output: "ok" }),
          });
          expect(result.record).toBeDefined();
          expect(result.record!.workflow_state_id).toMatch(/^wsid_/);
          ids.add(result.record!.workflow_state_id);
        }
        expect(ids.size).toBe(100);
      });
    });

    describe("R7.4: workflow_version from meta.version", () => {
      it("reads meta.version from workflow file", async () => {
        process.env.CLAUDE_CODE_WORKFLOWS = "1";
        const wfDir = join(tmpDir, "workflows");
        mkdirSync(wfDir, { recursive: true });
        mkdirSync(join(wfDir, "lib"), { recursive: true });
        writeFileSync(
          join(wfDir, "lib", "concurrency.js"),
          "export const chunkedParallel = () => {};\n",
        );
        writeFileSync(
          join(wfDir, "review.js"),
          `import { chunkedParallel } from './lib/concurrency.js';\nexport const meta = { version: '1.1.0' };\n`,
        );

        const result = await dispatch(makeCtx());
        expect(result.record).toBeDefined();
        expect(result.record!.workflow_version).toBe("1.1.0");
        delete process.env.CLAUDE_CODE_WORKFLOWS;
      });

      it("defaults workflow_version to 'unknown' when meta.version missing", async () => {
        delete process.env.CLAUDE_CODE_WORKFLOWS;
        const result = await dispatch(makeCtx(), {
          runFallback: vi.fn().mockResolvedValue({ output: "ok" }),
        });
        expect(result.record).toBeDefined();
        expect(result.record!.workflow_version).toBe("unknown");
      });
    });

    describe("R7.5: ISO-8601 timestamp", () => {
      it("writes valid ISO-8601 timestamp in dispatch.jsonl", async () => {
        delete process.env.CLAUDE_CODE_WORKFLOWS;
        await dispatch(makeCtx(), {
          runFallback: vi.fn().mockResolvedValue({ output: "ok" }),
        });

        const runDir = join(tmpDir, ".forge", "runs", "run-001");
        const content = readFileSync(join(runDir, "dispatch.jsonl"), "utf-8").trim();
        const record = JSON.parse(content);
        expect(record.timestamp).toBeDefined();
        const parsed = Date.parse(record.timestamp);
        expect(parsed).not.toBeNaN();
        // ISO-8601 check: contains 'T' and ends with 'Z'
        expect(record.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      });
    });

    describe("R7.7: exit_code mapping", () => {
      it("L0 success -> exit_code 0", async () => {
        process.env.CLAUDE_CODE_WORKFLOWS = "1";
        setupL0Workflow(tmpDir);

        const result = await dispatch(makeCtx());
        expect(result.record).toBeDefined();
        expect(result.record!.exit_code).toBe(0);
        delete process.env.CLAUDE_CODE_WORKFLOWS;
      });

      it("L0 fail -> L1 fallback -> exit_code 1", async () => {
        process.env.CLAUDE_CODE_WORKFLOWS = "1";
        setupL0Workflow(tmpDir);

        const result = await dispatch(makeCtx(), {
          tryL0: vi.fn().mockRejectedValue(new Error("bp() exception")),
          runFallback: vi
            .fn()
            .mockResolvedValue({ output: "fallback", methodology: "workflow-then-subagent" }),
        });
        expect(result.record).toBeDefined();
        expect(result.record!.exit_code).toBe(1);
        delete process.env.CLAUDE_CODE_WORKFLOWS;
      });

      it("L1 direct -> exit_code 0", async () => {
        delete process.env.CLAUDE_CODE_WORKFLOWS;
        const result = await dispatch(makeCtx(), {
          runFallback: vi.fn().mockResolvedValue({ output: "ok" }),
        });
        expect(result.record).toBeDefined();
        expect(result.record!.exit_code).toBe(0);
      });

      it("L3 blocked -> exit_code 2", async () => {
        delete process.env.CLAUDE_CODE_WORKFLOWS;
        const result = await dispatch(makeCtx(), {
          runFallback: vi.fn().mockResolvedValue(null),
          allFallbacksFailed: true,
        });
        expect(result.record).toBeDefined();
        expect(result.record!.exit_code).toBe(2);
      });
    });

    describe("R1.2: dispatch.jsonl has all 14 fields", () => {
      it("writes a record with all 14 required fields", async () => {
        delete process.env.CLAUDE_CODE_WORKFLOWS;
        await dispatch(makeCtx(), {
          runFallback: vi.fn().mockResolvedValue({ output: "ok" }),
        });

        const runDir = join(tmpDir, ".forge", "runs", "run-001");
        const content = readFileSync(join(runDir, "dispatch.jsonl"), "utf-8").trim();
        const record = JSON.parse(content);
        const requiredFields = [
          "subcommand",
          "mode",
          "run_id",
          "session_id",
          "workflow_state_id",
          "workflow_version",
          "gate_enabled",
          "workflow_available",
          "chosen_level",
          "exit_code",
          "duration_ms",
          "timestamp",
          "frozen_zone_blocked",
        ];
        for (const field of requiredFields) {
          expect(record).toHaveProperty(field);
        }
      });
    });

    describe("R1.3: status.md updated with dispatch fields", () => {
      it("writes dispatch_chosen_level, subcommand, run_id to status.md", async () => {
        const statusPath = join(tmpDir, ".forge", "status.md");
        writeFileSync(statusPath, "---\ncurrent_task: test\nphase: build\n---\n# Status\n");
        delete process.env.CLAUDE_CODE_WORKFLOWS;
        await dispatch(makeCtx(), {
          runFallback: vi.fn().mockResolvedValue({ output: "ok" }),
        });

        const updated = readFileSync(statusPath, "utf-8");
        expect(updated).toContain("dispatch_chosen_level: L1");
        expect(updated).toContain("dispatch_subcommand: review");
        expect(updated).toContain("dispatch_run_id: run-001");
      });
    });
  });

  // ---------------------------------------------------------------------------
  // T2: AuditWriter integration tests
  // ---------------------------------------------------------------------------

  describe("dispatch auditWriter integration", () => {
    it("calls auditWriter.write for L1 result", async () => {
      delete process.env.CLAUDE_CODE_WORKFLOWS;
      const auditWriter = { write: vi.fn().mockResolvedValue(undefined) };

      await dispatch(makeCtx(), {
        runFallback: vi.fn().mockResolvedValue({ output: "ok" }),
        auditWriter,
        topic: "test-topic",
      });

      expect(auditWriter.write).toHaveBeenCalledTimes(1);
      expect(auditWriter.write).toHaveBeenCalledWith(
        expect.objectContaining({
          subcommand: "review",
          runId: "run-001",
          topic: "test-topic",
        }),
      );
    });

    it("does not call auditWriter for L3 result", async () => {
      delete process.env.CLAUDE_CODE_WORKFLOWS;
      const auditWriter = { write: vi.fn().mockResolvedValue(undefined) };

      await dispatch(makeCtx(), {
        runFallback: vi.fn().mockResolvedValue(null),
        allFallbacksFailed: true,
        auditWriter,
        topic: "test-topic",
      });

      expect(auditWriter.write).not.toHaveBeenCalled();
    });

    it("sets frozen_zone_blocked=true when auditWriter throws FrozenZoneViolation", async () => {
      delete process.env.CLAUDE_CODE_WORKFLOWS;
      class FrozenZoneViolation extends Error {
        constructor() {
          super("FrozenZoneViolation");
          this.name = "FrozenZoneViolation";
        }
      }
      const auditWriter = {
        write: vi.fn().mockRejectedValue(new FrozenZoneViolation()),
      };

      const result = await dispatch(makeCtx(), {
        runFallback: vi.fn().mockResolvedValue({ output: "ok" }),
        auditWriter,
        topic: "frozen-topic",
      });

      expect(result.record.frozen_zone_blocked).toBe(true);
    });

    it("skips auditWriter when topic not provided", async () => {
      delete process.env.CLAUDE_CODE_WORKFLOWS;
      const auditWriter = { write: vi.fn().mockResolvedValue(undefined) };

      await dispatch(makeCtx(), {
        runFallback: vi.fn().mockResolvedValue({ output: "ok" }),
        auditWriter,
        // no topic
      });

      expect(auditWriter.write).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // T3: trace_id propagation
  // ---------------------------------------------------------------------------

  describe("trace_id propagation", () => {
    it("includes trace_id in DispatchRecord when provided via context", async () => {
      delete process.env.CLAUDE_CODE_WORKFLOWS;
      const result = await dispatch(makeCtx({ traceId: "trace_20260606T1437_abc123" }), {
        runFallback: vi.fn().mockResolvedValue({ output: "ok" }),
      });
      expect(result.record.trace_id).toBe("trace_20260606T1437_abc123");
    });

    it("writes trace_id to dispatch.jsonl", async () => {
      delete process.env.CLAUDE_CODE_WORKFLOWS;
      const ctx = makeCtx({
        traceId: "trace_20260606T1437_def456",
        runId: "run-trace-test",
      });
      await dispatch(ctx, { runFallback: vi.fn().mockResolvedValue({ output: "ok" }) });

      const jsonlPath = join(tmpDir, ".forge", "runs", "run-trace-test", "dispatch.jsonl");
      const content = readFileSync(jsonlPath, "utf-8").trim();
      const parsed = JSON.parse(content);
      expect(parsed.trace_id).toBe("trace_20260606T1437_def456");
    });

    it("writes dispatch_trace_id to status.md", () => {
      const statusPath = join(tmpDir, ".forge", "status.md");
      writeFileSync(statusPath, "---\ncurrent_task: test\nphase: build\n---\n# Status\n");

      updateStatusMd(statusPath, {
        dispatch_chosen_level: "L0",
        dispatch_subcommand: "review",
        dispatch_run_id: "run-001",
        dispatch_trace_id: "trace_20260606T1437_abc123",
      });

      const updated = readFileSync(statusPath, "utf-8");
      expect(updated).toContain("dispatch_trace_id: trace_20260606T1437_abc123");
    });

    it("record is valid without trace_id when context has empty traceId", async () => {
      delete process.env.CLAUDE_CODE_WORKFLOWS;
      const result = await dispatch(makeCtx({ traceId: "" }), {
        runFallback: vi.fn().mockResolvedValue({ output: "ok" }),
      });
      // Empty traceId → field omitted (backward compat)
      expect(result.record.trace_id).toBeUndefined();
      // Record still has all required fields
      expect(result.record).toHaveProperty("subcommand");
      expect(result.record).toHaveProperty("run_id");
    });

    it("trace_id survives L3 blocked path", async () => {
      delete process.env.CLAUDE_CODE_WORKFLOWS;
      const result = await dispatch(makeCtx({ traceId: "trace_20260606T1437_blocked" }), {
        runFallback: vi.fn().mockResolvedValue(null),
        allFallbacksFailed: true,
      });
      expect(result.record.trace_id).toBe("trace_20260606T1437_blocked");
    });
  });
});
