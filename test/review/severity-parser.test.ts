/**
 * extractSeverity + hasAnySeverityField — pure function unit tests.
 *
 * T-05 RED (Round 7 根治版): severity 解析四格式 × 两 YAML 结构 + safeNum 钳制 +
 * 入参自防 null + hasAnySeverityField 降级谓词。
 *
 * 这些测试在 src/review/severity-parser.ts 实现前应全部失败（RED）。
 * 对应 spec: .tinkerman/specs/arch-review-remediate-0626 REQ-04。
 */

import { describe, expect, it } from "vitest";
import { splitFrontmatterAndBody } from "../../src/review/frontmatter.js";
import { extractSeverity, hasAnySeverityField } from "../../src/review/severity-parser.js";

/** Helper: 把 frontmatter 文本解析成 fm 对象（复用既有 splitFrontmatterAndBody）。 */
function fmOf(frontmatter: string): Record<string, unknown> {
  const content = `---\n${frontmatter}\n---\nbody\n`;
  const { fm } = splitFrontmatterAndBody(content);
  return fm;
}

describe("extractSeverity — 四格式 × 两 YAML 结构", () => {
  it("扁平 canonical p0_count 格式（块式）", () => {
    const fm = fmOf("p0_count: 2\np1_count: 1");
    expect(extractSeverity(fm)).toEqual({ p0: 2, p1: 1, p2: 0, p3: 0 });
  });

  it("嵌套小写 severity_counts.p0（块式多行）", () => {
    const fm = fmOf("severity_counts:\n  p0: 1\n  p1: 1");
    expect(extractSeverity(fm)).toEqual({ p0: 1, p1: 1, p2: 0, p3: 0 });
  });

  it("嵌套小写 severity_counts.p0（流式 inline map）", () => {
    const fm = fmOf("severity_counts: { p0: 1, p1: 1 }");
    expect(extractSeverity(fm)).toEqual({ p0: 1, p1: 1, p2: 0, p3: 0 });
  });

  it("嵌套 new_p0 特例（块式）", () => {
    const fm = fmOf("severity_counts:\n  new_p0: 3");
    expect(extractSeverity(fm)).toEqual({ p0: 3, p1: 0, p2: 0, p3: 0 });
  });

  it("嵌套大写 severity_counts.P0（块式）", () => {
    const fm = fmOf("severity_counts:\n  P0: 2\n  P1: 1");
    expect(extractSeverity(fm)).toEqual({ p0: 2, p1: 1, p2: 0, p3: 0 });
  });

  it("嵌套大写 severity_counts.P0（流式 inline map）", () => {
    const fm = fmOf("severity_counts: { P0: 2 }");
    expect(extractSeverity(fm)).toEqual({ p0: 2, p1: 0, p2: 0, p3: 0 });
  });
});

describe("extractSeverity — max 聚合（fail-closed，闭合 Round 4 ?? 链 P0）", () => {
  it("扁平 0 + 嵌套非零混合 → max 取非零（不放行）", () => {
    // 攻击形态：p0_count:0（扁平）压不过 severity_counts.p0:5（嵌套）
    const fm = fmOf("p0_count: 0\nseverity_counts:\n  p0: 5");
    expect(extractSeverity(fm).p0).toBe(5);
  });

  it("双零（仅扁平 0）→ 放行（p0=0，钉死契约防 max 误放大）", () => {
    const fm = fmOf("p0_count: 0");
    expect(extractSeverity(fm).p0).toBe(0);
  });

  it("扁平 + 嵌套 + 大写三者并存 → max", () => {
    const fm = fmOf("p0_count: 1\nseverity_counts: { p0: 2, P0: 3 }");
    expect(extractSeverity(fm).p0).toBe(3);
  });
});

describe("extractSeverity — safeNum 钳制（闭合 Round 5 NaN/负数 P0）", () => {
  it("字符串值 p0:abc → 钳制为 0，不放行提升", () => {
    const fm = fmOf("severity_counts: { p0: abc }");
    expect(extractSeverity(fm).p0).toBe(0);
  });

  it("负数 p0:-1 → 钳制为 0（不因负数隐藏）", () => {
    const fm = fmOf("severity_counts: { p0: -1 }");
    expect(extractSeverity(fm).p0).toBe(0);
  });

  it("1e999（parseYaml → null）→ 0", () => {
    const fm = fmOf("severity_counts: { p0: 1e999 }");
    expect(extractSeverity(fm).p0).toBe(0);
  });

  it("布尔值 p0:true → 0（Number.isFinite(true)=false）", () => {
    const fm = fmOf("severity_counts: { p0: true }");
    expect(extractSeverity(fm).p0).toBe(0);
  });

  it("severity_counts 为数组 → sc.p0=undefined → 0", () => {
    const fm = fmOf("severity_counts: [1, 2, 3]");
    expect(extractSeverity(fm).p0).toBe(0);
  });

  it("severity_counts 为标量 → 0", () => {
    const fm = fmOf("severity_counts: notanobject");
    expect(extractSeverity(fm).p0).toBe(0);
  });
});

describe("extractSeverity — 入参自防 null + 缺失字段", () => {
  it("入参 null → {0,0,0,0}（自防，不抛）", () => {
    expect(extractSeverity(null as unknown as Record<string, unknown>)).toEqual({
      p0: 0,
      p1: 0,
      p2: 0,
      p3: 0,
    });
  });

  it("空 fm（无任何 severity 字段）→ {0,0,0,0}", () => {
    const fm = fmOf("topic: x\nmethodology: subagent-parallel");
    expect(extractSeverity(fm)).toEqual({ p0: 0, p1: 0, p2: 0, p3: 0 });
  });

  it("返回值无 null（签名是 {p0,p1,p2,p3}，不是 | null）", () => {
    const fm = fmOf("p0_count: 0");
    expect(extractSeverity(fm)).not.toBeNull();
  });
});

describe("hasAnySeverityField — fallback L2→L3 降级谓词（闭合 Round 7 降级语义漂移）", () => {
  it("有扁平 p0_count → true", () => {
    const fm = fmOf("p0_count: 0");
    expect(hasAnySeverityField(fm)).toBe(true);
  });

  it("有嵌套 severity_counts → true", () => {
    const fm = fmOf("severity_counts: { p0: 0 }");
    expect(hasAnySeverityField(fm)).toBe(true);
  });

  it("无任何 severity 字段 → false（触发 L2→L3 降级，而非当 0 finding 放行）", () => {
    const fm = fmOf("topic: x\nmethodology: subagent-parallel\nresult: pass");
    expect(hasAnySeverityField(fm)).toBe(false);
  });

  it("只有 P2/P3 也算有 severity 字段 → true", () => {
    const fm = fmOf("severity_counts: { p2: 1, p3: 1 }");
    expect(hasAnySeverityField(fm)).toBe(true);
  });
});
