/**
 * Fallback L2→L3 降级语义回归测试（Round 7 architect 缺口-3）。
 *
 * T-05 RED: 验证 fallback 复用 extractSeverity 后，"无 severity 字段"的报告
 * 仍触发 L2→L3 降级（更保守），而非被当作"0 finding 放行 L2"。
 *
 * 对应 spec: .tinkerman/specs/arch-review-remediate-0626 REQ-04。
 * 在 fallback.ts 改用 extractSeverity + hasAnySeverityField 前应失败（RED）。
 */

import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SubagentInvocation, SubagentResult } from "../../src/types.js";

vi.mock("../../src/subagent-runner.js", () => ({
  runSubagentsWithConcurrency: vi.fn(),
}));

import { runReviewFallbackLadder } from "../../src/review.js";
import { runSubagentsWithConcurrency } from "../../src/subagent-runner.js";

const mockedRunner = runSubagentsWithConcurrency as unknown as ReturnType<typeof vi.fn>;

const tempDir = join(tmpdir(), `forge-fallback-sev-${randomUUID()}`, ".tinkerman", "reviews");

function makeInvocation(i: number): SubagentInvocation {
  return {
    agentType: `agent-${i}`,
    prompt: `Task ${i}`,
    permissionMode: "default",
    maxTurns: 10,
  };
}

beforeEach(() => {
  mockedRunner.mockReset();
  try {
    rmSync(tempDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  mkdirSync(tempDir, { recursive: true });
});

describe("fallback L2 CI evidence — 降级语义不反转（Round 7）", () => {
  it("CI 证据含 severity 字段（扁平 p0_count:0）→ L2 ci-hit，不当降级", async () => {
    const invocations = [makeInvocation(0), makeInvocation(1), makeInvocation(2)];
    mockedRunner.mockImplementation(() => ({
      succeeded: [],
      failed: invocations.map((inv) => ({ agentType: inv.agentType, error: "fail" })),
    }));

    const ciFilePath = join(tempDir, "ci-with-severity.md");
    writeFileSync(
      ciFilePath,
      `---
p0_count: 0
p1_count: 0
---
CI findings
`,
    );

    const result = await runReviewFallbackLadder({
      invocations,
      executor: async (inv) => ({ agentType: inv.agentType, status: "failure", error: "fail" }),
      ciEvidencePath: ciFilePath,
    });

    // 有 severity 字段（即便是 0）→ L2 命中 ci-evidence
    expect(result.methodology).toBe("ci-evidence");
    expect(result.ciEvidence).toBeDefined();
    expect(result.ciEvidence?.severity_counts).toEqual({ p0: 0, p1: 0, p2: 0, p3: 0 });
    expect(result.trace.some((t) => t.level === "L2" && t.outcome === "ci-hit")).toBe(true);
  });

  it("CI 证据含嵌套 severity（severity_counts.p0:0）→ L2 ci-hit（修复后应识别嵌套）", async () => {
    const invocations = [makeInvocation(0), makeInvocation(1), makeInvocation(2)];
    mockedRunner.mockImplementation(() => ({
      succeeded: [],
      failed: invocations.map((inv) => ({ agentType: inv.agentType, error: "fail" })),
    }));

    const ciFilePath = join(tempDir, "ci-nested.md");
    writeFileSync(
      ciFilePath,
      `---
severity_counts:
  p0: 0
  p1: 0
---
CI findings
`,
    );

    const result = await runReviewFallbackLadder({
      invocations,
      executor: async (inv) => ({ agentType: inv.agentType, status: "failure", error: "fail" }),
      ciEvidencePath: ciFilePath,
    });

    // 修复后：嵌套 severity 也应被识别为"有证据"→ L2 ci-hit
    expect(result.methodology).toBe("ci-evidence");
    expect(result.ciEvidence).toBeDefined();
    expect(result.trace.some((t) => t.level === "L2" && t.outcome === "ci-hit")).toBe(true);
  });

  it("CI 证据无任何 severity 字段 → 不当 0 finding 放行（应降级，非 ci-hit）", async () => {
    const invocations = [makeInvocation(0), makeInvocation(1), makeInvocation(2)];
    mockedRunner.mockImplementation(() => ({
      succeeded: [],
      failed: invocations.map((inv) => ({ agentType: inv.agentType, error: "fail" })),
    }));

    const ciFilePath = join(tempDir, "ci-no-severity.md");
    writeFileSync(
      ciFilePath,
      `---
methodology: subagent-parallel
result: pass
---
CI findings without severity
`,
    );

    const result = await runReviewFallbackLadder({
      invocations,
      executor: async (inv) => ({ agentType: inv.agentType, status: "failure", error: "fail" }),
      ciEvidencePath: ciFilePath,
    });

    // 无 severity 字段 → 不应被当作"0 finding 放行 L2"（hasAnySeverityField=false → 不命中 ci-evidence）
    // 应继续降级到 L3（unavailable）
    expect(result.methodology).not.toBe("ci-evidence");
    expect(result.trace.some((t) => t.level === "L2" && t.outcome === "ci-hit")).toBe(false);
  });
});
