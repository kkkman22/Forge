/**
 * Unit tests (example-based) for the execution-mode module.
 *
 * Covers:
 *   - Type definition completeness (interactive/autonomous two modes)
 *   - Edge cases: empty string, corrupted StatusFile content, extra whitespace
 *
 * **Validates: Requirements 1.1**
 */
import { describe, expect, it } from "vitest";
import type {
  ConfirmationDecision,
  ConfirmationPoint,
  ExecutionMode,
} from "../src/execution-mode.js";
import {
  clearExecutionMode,
  getExecutionMode,
  resolveConfirmation,
  writeExecutionMode,
} from "../src/execution-mode.js";

// ---------------------------------------------------------------------------
// Type definition completeness
// ---------------------------------------------------------------------------

describe("ExecutionMode type definition completeness", () => {
  it("accepts 'interactive' as a valid ExecutionMode", () => {
    const mode: ExecutionMode = "interactive";
    expect(mode).toBe("interactive");
  });

  it("accepts 'autonomous' as a valid ExecutionMode", () => {
    const mode: ExecutionMode = "autonomous";
    expect(mode).toBe("autonomous");
  });

  it("both ExecutionMode values are recognized by getExecutionMode", () => {
    const interactiveContent = '---\nmode: "interactive"\n---\n';
    const autonomousContent = '---\nmode: "autonomous"\n---\n';

    expect(getExecutionMode(interactiveContent)).toBe("interactive");
    expect(getExecutionMode(autonomousContent)).toBe("autonomous");
  });

  it("all 11 ConfirmationPoint values are accepted by resolveConfirmation", () => {
    const points: ConfirmationPoint[] = [
      "router_tier",
      "plan_approval",
      "build_pause",
      "review_p0p1",
      "ship_method",
      "refactor_scan_select",
      "refactor_design_review",
      "refactor_apply_step",
      "fix_report_confirm",
      "fix_analyze_confirm",
      "fix_apply_verify",
    ];

    for (const point of points) {
      const decision = resolveConfirmation("autonomous", point);
      expect(decision.action).toBe("auto");
      expect(decision.preset).toBeDefined();
    }
  });

  it("ConfirmationDecision has correct shape for autonomous mode", () => {
    const decision: ConfirmationDecision = resolveConfirmation("autonomous", "router_tier");
    expect(decision).toHaveProperty("action");
    expect(decision).toHaveProperty("preset");
    expect(decision.action).toBe("auto");
    expect(typeof decision.preset).toBe("string");
  });

  it("ConfirmationDecision has correct shape for interactive mode", () => {
    const decision: ConfirmationDecision = resolveConfirmation("interactive", "router_tier");
    expect(decision).toHaveProperty("action");
    expect(decision.action).toBe("wait_for_user");
    expect(decision.preset).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// All 5 ConfirmationPoint presets in autonomous mode
// ---------------------------------------------------------------------------

describe("Autonomous mode presets for all ConfirmationPoints", () => {
  it("router_tier preset is 'auto-detect'", () => {
    const decision = resolveConfirmation("autonomous", "router_tier");
    expect(decision.preset).toBe("auto-detect");
  });

  it("plan_approval preset is 'auto-approve'", () => {
    const decision = resolveConfirmation("autonomous", "plan_approval");
    expect(decision.preset).toBe("auto-approve");
  });

  it("build_pause preset is 'continue'", () => {
    const decision = resolveConfirmation("autonomous", "build_pause");
    expect(decision.preset).toBe("continue");
  });

  it("review_p0p1 preset is 'auto-fix'", () => {
    const decision = resolveConfirmation("autonomous", "review_p0p1");
    expect(decision.preset).toBe("auto-fix");
  });

  it("ship_method preset is 'keep branch'", () => {
    const decision = resolveConfirmation("autonomous", "ship_method");
    expect(decision.preset).toBe("keep branch");
  });

  // ★ 新增：重構流程確認點
  it("refactor_scan_select preset is 'auto-select-recommended'", () => {
    const decision = resolveConfirmation("autonomous", "refactor_scan_select");
    expect(decision.preset).toBe("auto-select-recommended");
  });

  it("refactor_design_review preset is 'auto-approve'", () => {
    const decision = resolveConfirmation("autonomous", "refactor_design_review");
    expect(decision.preset).toBe("auto-approve");
  });

  it("refactor_apply_step preset is 'continue'", () => {
    const decision = resolveConfirmation("autonomous", "refactor_apply_step");
    expect(decision.preset).toBe("continue");
  });

  // ★ 新增：Bug 修復流程確認點
  it("fix_report_confirm preset is 'auto-confirm'", () => {
    const decision = resolveConfirmation("autonomous", "fix_report_confirm");
    expect(decision.preset).toBe("auto-confirm");
  });

  it("fix_analyze_confirm preset is 'auto-recommend'", () => {
    const decision = resolveConfirmation("autonomous", "fix_analyze_confirm");
    expect(decision.preset).toBe("auto-recommend");
  });

  it("fix_apply_verify preset is 'auto-verify'", () => {
    const decision = resolveConfirmation("autonomous", "fix_apply_verify");
    expect(decision.preset).toBe("auto-verify");
  });
});

// ---------------------------------------------------------------------------
// Edge cases: empty string input
// ---------------------------------------------------------------------------

describe("getExecutionMode edge cases: empty string", () => {
  it("returns 'interactive' for empty string", () => {
    expect(getExecutionMode("")).toBe("interactive");
  });

  it("writeExecutionMode on empty string creates valid frontmatter", () => {
    const result = writeExecutionMode("", "autonomous");
    expect(getExecutionMode(result)).toBe("autonomous");
  });

  it("clearExecutionMode on empty string returns empty string unchanged", () => {
    expect(clearExecutionMode("")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Edge cases: string without frontmatter
// ---------------------------------------------------------------------------

describe("getExecutionMode edge cases: no frontmatter", () => {
  it("returns 'interactive' for plain text without frontmatter", () => {
    expect(getExecutionMode("just some text")).toBe("interactive");
  });

  it("returns 'interactive' for text that looks like YAML but has no delimiters", () => {
    expect(getExecutionMode('mode: "autonomous"')).toBe("interactive");
  });

  it("writeExecutionMode on plain text wraps it in frontmatter", () => {
    const result = writeExecutionMode("some body text", "autonomous");
    expect(getExecutionMode(result)).toBe("autonomous");
    expect(result).toContain("some body text");
  });
});

// ---------------------------------------------------------------------------
// Edge cases: malformed frontmatter (missing closing ---)
// ---------------------------------------------------------------------------

describe("getExecutionMode edge cases: malformed frontmatter", () => {
  it("returns 'interactive' when closing --- is missing", () => {
    const content = '---\nmode: "autonomous"\n';
    expect(getExecutionMode(content)).toBe("interactive");
  });

  it("returns 'interactive' when only opening --- is present", () => {
    const content = "---\n";
    expect(getExecutionMode(content)).toBe("interactive");
  });

  it("returns 'interactive' for just the delimiter string", () => {
    expect(getExecutionMode("---")).toBe("interactive");
  });
});

// ---------------------------------------------------------------------------
// Edge cases: extra whitespace and newlines
// ---------------------------------------------------------------------------

describe("getExecutionMode edge cases: extra whitespace/newlines", () => {
  it("handles content with extra newlines in body", () => {
    const content = '---\nmode: "autonomous"\n---\n\n\n\nbody\n\n';
    expect(getExecutionMode(content)).toBe("autonomous");
  });

  it("handles mode field with extra spaces around value", () => {
    const content = '---\nmode:   "autonomous"  \n---\n';
    expect(getExecutionMode(content)).toBe("autonomous");
  });

  it("handles mode field with spaces around unquoted value", () => {
    const content = "---\nmode:   autonomous  \n---\n";
    expect(getExecutionMode(content)).toBe("autonomous");
  });

  it("handles leading whitespace before frontmatter", () => {
    const content = '  \n---\nmode: "autonomous"\n---\n';
    expect(getExecutionMode(content)).toBe("autonomous");
  });

  it("handles frontmatter with blank lines between fields", () => {
    const content = '---\ncurrent_task: "test"\n\nmode: "autonomous"\n---\n';
    expect(getExecutionMode(content)).toBe("autonomous");
  });
});

// ---------------------------------------------------------------------------
// Edge cases: corrupted StatusFile content
// ---------------------------------------------------------------------------

describe("getExecutionMode edge cases: corrupted content", () => {
  it("returns 'interactive' for random binary-like content", () => {
    expect(getExecutionMode("\x00\x01\x02\x03")).toBe("interactive");
  });

  it("returns 'interactive' for mode with invalid value", () => {
    const content = '---\nmode: "invalid_mode"\n---\n';
    expect(getExecutionMode(content)).toBe("interactive");
  });

  it("returns 'interactive' for mode with empty quoted value", () => {
    const content = '---\nmode: ""\n---\n';
    expect(getExecutionMode(content)).toBe("interactive");
  });

  it("returns 'interactive' for mode with numeric value", () => {
    const content = "---\nmode: 42\n---\n";
    expect(getExecutionMode(content)).toBe("interactive");
  });

  it("returns 'interactive' for multiple --- delimiters", () => {
    const content = "---\n---\n---\n";
    expect(getExecutionMode(content)).toBe("interactive");
  });

  it("handles mode field among many other fields", () => {
    const content = [
      "---",
      'current_task: "build feature"',
      'tier: "standard"',
      'phase: "build"',
      'mode: "autonomous"',
      'updated: "2025-01-15"',
      "---",
      "body content",
    ].join("\n");
    expect(getExecutionMode(content)).toBe("autonomous");
  });
});
