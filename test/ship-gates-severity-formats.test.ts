/**
 * Ship-gate severity 解析 P0 回归矩阵（端到端，via checkReviewGate）。
 *
 * T-05 RED (Round 7 根治版): 验证 ship-gate 对四种 severity 格式 × 两种 YAML 结构的
 * 报告能正确阻断/放行，闭合原 P0（嵌套漏读）+ Round 4（?? 链/大写）+
 * Round 5（NaN）+ Round 6（异常逃逸）。
 *
 * 对应 spec: .forge/specs/arch-review-remediate-0626 REQ-04。
 * 这些测试在 ship-gates.ts 改用 splitFrontmatterAndBody + extractSeverity 前应失败（RED）。
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkReviewGate } from "../src/ship-gates.js";

/** Helper: 建临时 review 目录并写入一份报告，返回目录路径。 */
function reviewDirWith(frontmatterBody: string): string {
  const tmpDir = mkdtempSync(join(tmpdir(), "forge-severity-p0-test-"));
  mkdirSync(join(tmpDir, "reviews"), { recursive: true });
  writeFileSync(
    join(tmpDir, "reviews", "20260626-review.md"),
    `---\n${frontmatterBody}\n---\n# Review\n`,
  );
  return join(tmpDir, "reviews");
}

describe("checkReviewGate — 嵌套 severity 格式 P0 漏洞（原 P0 闭合）", () => {
  it("嵌套 severity_counts.p0:1（块式）→ 阻断 ship（当前代码读 p0Count=0 放行）", () => {
    const dir = reviewDirWith("severity_counts:\n  p0: 1\nmethodology: subagent-parallel");
    try {
      const result = checkReviewGate(dir, "abc1234");
      expect(result.passed).toBe(false);
      expect(result.reason).toMatch(/P0/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("嵌套 severity_counts.p0:1（流式 inline map）→ 阻断 ship", () => {
    const dir = reviewDirWith("severity_counts: { p0: 1 }\nmethodology: subagent-parallel");
    try {
      const result = checkReviewGate(dir, "abc1234");
      expect(result.passed).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("嵌套大写 severity_counts.P0:2（块式）→ 阻断 ship（闭合 Round 4 大写格式）", () => {
    const dir = reviewDirWith("severity_counts:\n  P0: 2\nmethodology: subagent-parallel");
    try {
      const result = checkReviewGate(dir, "abc1234");
      expect(result.passed).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("checkReviewGate — ?? 链 fail-open 闭合（Round 4）", () => {
  it("扁平 p0_count:0 + 嵌套 p0:5 混合 → 阻断（扁平零值不压过嵌套非零）", () => {
    const dir = reviewDirWith(
      "p0_count: 0\nseverity_counts:\n  p0: 5\nmethodology: subagent-parallel",
    );
    try {
      const result = checkReviewGate(dir, "abc1234");
      expect(result.passed).toBe(false);
      expect(result.reason).toMatch(/P0/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("checkReviewGate — safeNum 钳制（Round 5 NaN/负数）", () => {
  it("severity_counts.p0:abc → 不放行（钳制为 0，但无真实 P0 也不误判；此处验证不崩）", () => {
    // abc → 0，无 P0 → 应放行（不是 blocked 报告）
    const dir = reviewDirWith("severity_counts: { p0: abc }\nmethodology: subagent-parallel");
    try {
      const result = checkReviewGate(dir, "abc1234");
      // abc 钳制为 0，无 P0 → 不应因 P0 阻断
      expect(result.reason).not.toMatch(/P0 issue/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("checkReviewGate — 畸形 YAML 异常兜底（Round 6 availability P0）", () => {
  it("畸形 YAML（未闭合 flow map）→ 阻断 ship 不崩溃（结构化 fail-closed）", () => {
    // 未闭合的 {p0:1 会让 parseYaml 抛 YAMLParseError
    const dir = reviewDirWith("severity_counts: { p0: 1\nmethodology: subagent-parallel");
    try {
      const result = checkReviewGate(dir, "abc1234");
      // 异常 → parseReviewReportFrontmatter 返回 null → passed:false（阻断，不崩溃）
      expect(result.passed).toBe(false);
      expect(result.reason.toLowerCase()).toMatch(/parse|failed/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("畸形 YAML（tab 缩进错乱）→ 阻断不崩溃", () => {
    const dir = reviewDirWith("\tseverity_counts:\n  p0: 1\nmethodology: subagent-parallel");
    try {
      const result = checkReviewGate(dir, "abc1234");
      expect(result.passed).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("checkReviewGate — 双零放行契约 + 扁平兼容", () => {
  it("扁平 p0_count:0 p1_count:0（合法 pass 报告）→ 不因 P0 阻断", () => {
    const dir = reviewDirWith(
      "p0_count: 0\np1_count: 0\nmethodology: subagent-parallel\nresult: pass",
    );
    try {
      const result = checkReviewGate(dir, "abc1234");
      // 无 P0 → reason 不应提 P0 issue（可能因其他 gate，但不应是 P0 阻断）
      expect(result.reason).not.toMatch(/P0 issue/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("只有嵌套字段无扁平字段 → 不误判 null（不早返，能读出 severity）", () => {
    const dir = reviewDirWith("severity_counts:\n  p0: 0\n  p1: 0\nmethodology: subagent-parallel");
    try {
      const result = checkReviewGate(dir, "abc1234");
      // 无 P0/P1 → 不应因 severity 阻断（验证 :119 早返不误触发）
      expect(result.reason).not.toMatch(/P0 issue/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
