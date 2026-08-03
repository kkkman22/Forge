/**
 * P2 R8 (项5): compact compensation chain completeness + capability-driven relief.
 *
 * P1 supersede "不做完整 compact 补偿": the chain is already complete on both
 * platforms. This test locks the chain's existence and asserts the
 * capability-driven relief — GLM-5.2 Long Horizon reduces compact impact
 * (cross-task judgement retained), so the governance budget is wider and
 * compaction triggers less often.
 *
 * Claude side: PreCompact → PostCompact (checkpoint injection).
 * Zcode side: no PreCompact → Stop hook injects status.md (P1 R1 compensation).
 *
 * Validates: design.md R8 — compact compensation completeness.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CLAUDE_CAPABILITIES, GLM52_CAPABILITIES } from "../../src/host/capabilities";
import { deriveGovernance } from "../../src/host/governance";

const ROOT = resolve(__dirname, "..", "..");

describe("compact compensation chain — both platforms covered", () => {
  it("Claude side: PreCompact hook script exists", () => {
    expect(existsSync(resolve(ROOT, "scripts/hook-precompact.sh"))).toBe(true);
  });

  it("Claude side: PostCompact hook script exists", () => {
    expect(existsSync(resolve(ROOT, "scripts/hook-postcompact.sh"))).toBe(true);
  });

  it("Claude side: compact-inject.mjs (budgeted PostCompact injection) exists", () => {
    expect(existsSync(resolve(ROOT, "scripts/compact-inject.mjs"))).toBe(true);
  });

  it("Zcode side: Stop compensation injector exists (P1 R1)", () => {
    expect(existsSync(resolve(ROOT, "scripts/stop-additional-context.mjs"))).toBe(true);
  });
});

describe("compact compensation — capability-driven relief", () => {
  it("GLM-5.2 (1M) compacts far less often than Claude (200K)", () => {
    const glm52 = deriveGovernance(GLM52_CAPABILITIES, {});
    const claude = deriveGovernance(CLAUDE_CAPABILITIES, {});
    // sliceThreshold = compaction trigger. Wider window → fewer compactions.
    expect(glm52.sliceThreshold).toBeGreaterThan(claude.sliceThreshold);
    // 5x wider threshold on GLM-5.2 → ~5x fewer compaction events.
    expect(glm52.sliceThreshold / claude.sliceThreshold).toBeGreaterThan(4);
  });

  it("GLM-5.2 Long Horizon retains cross-task judgement post-compact (capability)", () => {
    // supportsLongHorizon is the capability that makes Zcode's missing PreCompact
    // less impactful: even after a compaction boundary, the model keeps engineering
    // judgement across tasks. Claude does not have this → PreCompact essential.
    expect(GLM52_CAPABILITIES.supportsLongHorizon).toBe(true);
    expect(CLAUDE_CAPABILITIES.supportsLongHorizon).toBe(false);
  });
});
