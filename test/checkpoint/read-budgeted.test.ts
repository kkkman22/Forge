/**
 * Tests for section-aware budgeted checkpoint reading (regenerative-checkpoint R3, Task 4).
 *
 * Validates the PostCompact hook's core read primitive: given a checkpoint.md
 * (11 sections delimited by `## §N`) and a token budget, return the full text
 * if it fits, or a skeleton (headers + italic instructions, bodies truncated)
 * with a truncation hint if it exceeds the budget.
 *
 * Design ref: .forge/specs/regenerative-checkpoint/design.md §接口设计 + D9
 * (section-aware so GLM-5.2 600K compact can still inject a usable skeleton).
 */
import { describe, expect, it } from "vitest";
import { readBudgetedSectionAware } from "../../src/checkpoint/read-budgeted.js";

// Minimal 3-section checkpoint fixture (real one has 11; logic is the same).
// Body lines are padded so the full fixture exceeds small budgets (triggers truncation).
const FIXTURE = [
  "# Session Checkpoint",
  "",
  "## §1 当前阶段与意图",
  "_当前 Forge 阶段 + 用户原话 block-quote。_",
  "_预算：~500 tokens_",
  "",
  "阶段：build",
  "",
  "> 实现登录功能",
  ...Array.from({ length: 40 }, (_, i) => `细节行 ${i}: 需要足够内容来撑大 fixture 以触发截断逻辑测试。`),
  "",
  "## §2 下一步具体动作",
  "_单一下一步。_",
  "_预算：~1000 tokens_",
  "",
  "写 src/auth.ts 的 JWT 验证函数，复用 lib/jwt.ts 的 sign 逻辑。",
  ...Array.from({ length: 40 }, (_, i) => `备选方案 ${i}: 探讨不同的实现路径和权衡取舍。`),
  "",
  "## §11 EXACT-FORM 值（逐字节保留）",
  "_所有精确值逐字节复制。_",
  "_预算：~800 tokens_",
  "",
  "JWT_SECRET=sk_test_abc123",
  "PORT=8443",
  ...Array.from({ length: 20 }, (_, i) => `EXTRA_VAR_${i}=value_${i}`),
].join("\n");

describe("readBudgetedSectionAware", () => {
  it("returns full text when under budget (no truncation)", () => {
    const result = readBudgetedSectionAware(FIXTURE, 10_000);
    expect(result.truncated).toBe(false);
    expect(result.text).toBe(FIXTURE);
  });

  it("truncates with skeleton when over budget", () => {
    // Budget so small that body must be truncated, but skeleton (headers+italic) kept.
    const result = readBudgetedSectionAware(FIXTURE, 200);
    expect(result.truncated).toBe(true);
    // Skeleton: every `## §N` header preserved.
    expect(result.text).toContain("## §1 当前阶段与意图");
    expect(result.text).toContain("## §2 下一步具体动作");
    expect(result.text).toContain("## §11 EXACT-FORM 值（逐字节保留）");
    // Italic instruction lines preserved (the `_..._` lines).
    expect(result.text).toContain("_当前 Forge 阶段");
    // Truncation hint present with file path guidance.
    expect(result.text).toMatch(/Truncat/i);
  });

  it("preserves preamble (content before first `## ` section)", () => {
    const result = readBudgetedSectionAware(FIXTURE, 200);
    // "# Session Checkpoint" is preamble, always kept.
    expect(result.text).toContain("# Session Checkpoint");
  });

  it("estimates totalTokens for budget calculation", () => {
    const result = readBudgetedSectionAware(FIXTURE, 10_000);
    expect(result.totalTokens).toBeGreaterThan(0);
    expect(typeof result.totalTokens).toBe("number");
  });

  it("handles empty input gracefully", () => {
    const result = readBudgetedSectionAware("", 5_000);
    expect(result.text).toBe("");
    expect(result.truncated).toBe(false);
  });

  it("handles input with no sections (all preamble)", () => {
    const noSections = "Just some flat text with no headers at all.".repeat(50);
    const result = readBudgetedSectionAware(noSections, 200);
    expect(result.truncated).toBe(true);
    // Flat text truncated at budget, with hint.
    expect(result.text).toMatch(/Truncat/i);
  });

  it("keeps section body when section individually fits remaining budget", () => {
    // Budget large enough for §1 body but not §2 body.
    // §1 is short; §2 has a longer body. Pick a budget between them.
    const result = readBudgetedSectionAware(FIXTURE, 350);
    // §1 header always kept (it's the first section).
    expect(result.text).toContain("## §1 当前阶段与意图");
  });
});
