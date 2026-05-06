/**
 * Property-based tests for the execution-mode module.
 *
 * Covers:
 *   - Property 1: ExecutionMode round-trip consistency（写入/清除往返一致性）
 *   - Property 2: 自主モード確認点全自動
 *   - getExecutionMode 解析正確性
 *
 * **Validates: Requirements 2.2, 2.3, 13.1, 13.4**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { clearExecutionMode, getExecutionMode, resolveConfirmation, writeExecutionMode, } from "../src/execution-mode.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/** Arbitrary single-line YAML field value (no newlines, no `---`). */
const yamlValueArb = fc
    .string({ minLength: 1, maxLength: 40 })
    .filter((s) => !s.includes("\n") && !s.includes("\r") && !s.includes("---"))
    .map((s) => s.replace(/"/g, "'"))
    .filter((s) => s.trim().length > 0);
/** Arbitrary YAML field key (simple alphanumeric + underscore). */
const yamlKeyArb = fc.stringMatching(/^[a-z][a-z0-9_]{0,15}$/).filter((s) => s !== "mode");
/** Arbitrary single YAML frontmatter field line (key: "value"). */
const yamlFieldArb = fc.tuple(yamlKeyArb, yamlValueArb).map(([key, value]) => `${key}: "${value}"`);
/** Arbitrary body content (multi-line text after frontmatter). */
const bodyContentArb = fc
    .array(fc.string({ minLength: 0, maxLength: 60 }).filter((s) => !s.includes("---")), { minLength: 0, maxLength: 5 })
    .map((lines) => lines.join("\n"));
/**
 * Generate valid StatusFile content with YAML frontmatter.
 * Format:
 * ---
 * field1: "value1"
 * field2: "value2"
 * ---
 * body content
 */
const statusFileArb = fc
    .tuple(fc.array(yamlFieldArb, { minLength: 0, maxLength: 5 }), bodyContentArb)
    .map(([fields, body]) => {
    const fm = fields.length > 0 ? fields.join("\n") : 'current_task: "default"';
    return `---\n${fm}\n---\n${body}`;
});
/** Arbitrary valid ExecutionMode value. */
const executionModeArb = fc.constantFrom("interactive", "autonomous");
/** Arbitrary ConfirmationPoint value (all 11 values). */
const confirmationPointArb = fc.constantFrom("router_tier", "plan_approval", "build_pause", "review_p0p1", "ship_method", "refactor_scan_select", "refactor_design_review", "refactor_apply_step", "fix_report_confirm", "fix_analyze_confirm", "fix_apply_verify");
/** Arbitrary ConfirmationPoint value (original 5 only — for backward compat tests). */
const originalConfirmationPointArb = fc.constantFrom("router_tier", "plan_approval", "build_pause", "review_p0p1", "ship_method");
/** Arbitrary ConfirmationPoint value (new 6 only — for new-point-specific tests). */
const newConfirmationPointArb = fc.constantFrom("refactor_scan_select", "refactor_design_review", "refactor_apply_step", "fix_report_confirm", "fix_analyze_confirm", "fix_apply_verify");
/**
 * Generate StatusFile content with an explicit mode field.
 */
const statusFileWithModeArb = fc
    .tuple(executionModeArb, fc.array(yamlFieldArb, { minLength: 0, maxLength: 4 }), bodyContentArb)
    .map(([mode, fields, body]) => {
    const allFields = [...fields, `mode: "${mode}"`];
    return {
        content: `---\n${allFields.join("\n")}\n---\n${body}`,
        mode,
    };
});
/**
 * Generate StatusFile content with an invalid/unparseable mode field.
 */
const statusFileWithInvalidModeArb = fc
    .tuple(fc
    .string({ minLength: 1, maxLength: 20 })
    .filter((s) => s !== "interactive" && s !== "autonomous" && !s.includes("\n") && !s.includes("---")), fc.array(yamlFieldArb, { minLength: 0, maxLength: 4 }), bodyContentArb)
    .map(([invalidMode, fields, body]) => {
    const allFields = [...fields, `mode: "${invalidMode}"`];
    return `---\n${allFields.join("\n")}\n---\n${body}`;
});
/**
 * Generate StatusFile content without a mode field.
 */
const statusFileWithoutModeArb = fc
    .tuple(fc.array(yamlFieldArb, { minLength: 1, maxLength: 5 }), bodyContentArb)
    .map(([fields, body]) => `---\n${fields.join("\n")}\n---\n${body}`);
// ---------------------------------------------------------------------------
// Feature: loop-skills-fusion, Property 1: ExecutionMode round-trip consistency
// ---------------------------------------------------------------------------
describe("Feature: loop-skills-fusion, Property 1: ExecutionMode round-trip consistency", () => {
    /**
     * **Validates: Requirements 13.1, 13.4**
     *
     * For any valid StatusFile content, writing autonomous mode then clearing
     * it should result in getExecutionMode returning "interactive" (default).
     */
    it("writeExecutionMode then clearExecutionMode results in interactive mode", () => {
        fc.assert(fc.property(statusFileArb, (content) => {
            const withMode = writeExecutionMode(content, "autonomous");
            const cleared = clearExecutionMode(withMode);
            const mode = getExecutionMode(cleared);
            expect(mode).toBe("interactive");
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 13.1, 13.4**
     *
     * For any valid StatusFile content and any mode, writing then clearing
     * should preserve other frontmatter fields. We verify by checking that
     * the non-mode fields from the original content are still present.
     */
    it("round-trip preserves other frontmatter fields", () => {
        fc.assert(fc.property(statusFileArb, executionModeArb, (content, mode) => {
            const withMode = writeExecutionMode(content, mode);
            const cleared = clearExecutionMode(withMode);
            // Extract non-mode frontmatter lines from original
            const originalMatch = content.match(/^---\n([\s\S]*?)\n---/);
            if (!originalMatch)
                return; // skip if no frontmatter
            const originalFields = originalMatch[1]
                .split("\n")
                .filter((line) => line.trim() !== "" && !line.startsWith("mode:"));
            // Extract non-mode frontmatter lines from round-tripped
            const clearedMatch = cleared.match(/^---\n([\s\S]*?)\n---/);
            expect(clearedMatch).not.toBeNull();
            const clearedFields = clearedMatch?.[1]
                .split("\n")
                .filter((line) => line.trim() !== "" && !line.startsWith("mode:"));
            expect(clearedFields).toEqual(originalFields);
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 13.1**
     *
     * For any valid StatusFile content and any mode, after writeExecutionMode,
     * getExecutionMode should return the written mode.
     */
    it("writeExecutionMode followed by getExecutionMode returns the written mode", () => {
        fc.assert(fc.property(statusFileArb, executionModeArb, (content, mode) => {
            const updated = writeExecutionMode(content, mode);
            const readMode = getExecutionMode(updated);
            expect(readMode).toBe(mode);
        }), { numRuns: 50 });
    });
});
// ---------------------------------------------------------------------------
// Feature: loop-skills-fusion, Property 2: getExecutionMode 解析正確性
// ---------------------------------------------------------------------------
describe("Feature: loop-skills-fusion, Property 2: getExecutionMode 解析正確性", () => {
    /**
     * **Validates: Requirements 1.4, 1.5**
     *
     * For any StatusFile content containing a valid mode field,
     * getExecutionMode returns the corresponding mode value.
     */
    it("returns the correct mode when a valid mode field is present", () => {
        fc.assert(fc.property(statusFileWithModeArb, ({ content, mode }) => {
            const result = getExecutionMode(content);
            expect(result).toBe(mode);
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 1.5**
     *
     * For any StatusFile content with an invalid/unparseable mode value,
     * getExecutionMode returns "interactive" as the default.
     */
    it("returns interactive for invalid mode values", () => {
        fc.assert(fc.property(statusFileWithInvalidModeArb, (content) => {
            const result = getExecutionMode(content);
            expect(result).toBe("interactive");
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 1.5**
     *
     * For any StatusFile content without a mode field,
     * getExecutionMode returns "interactive" as the default.
     */
    it("returns interactive when mode field is missing", () => {
        fc.assert(fc.property(statusFileWithoutModeArb, (content) => {
            const result = getExecutionMode(content);
            expect(result).toBe("interactive");
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 1.5**
     *
     * For any arbitrary string that is not valid YAML frontmatter,
     * getExecutionMode returns "interactive" as the default.
     */
    it("returns interactive for content without valid frontmatter", () => {
        fc.assert(fc.property(fc.string({ minLength: 0, maxLength: 200 }).filter((s) => !s.trimStart().startsWith("---")), (content) => {
            const result = getExecutionMode(content);
            expect(result).toBe("interactive");
        }), { numRuns: 50 });
    });
});
// ---------------------------------------------------------------------------
// Feature: loop-skills-fusion, Property 2: 自主モード確認点全自動
// ---------------------------------------------------------------------------
describe("Feature: loop-skills-fusion, Property 2: 自主モード確認点全自動", () => {
    /**
     * **Validates: Requirements 2.2, 2.3**
     *
     * For any ConfirmationPoint, when mode is autonomous,
     * resolveConfirmation returns action: "auto" with a defined preset string.
     */
    it("autonomous mode returns auto with a defined preset string for all confirmation points", () => {
        fc.assert(fc.property(confirmationPointArb, (point) => {
            const decision = resolveConfirmation("autonomous", point);
            expect(decision.action).toBe("auto");
            expect(decision.preset).toBeDefined();
            expect(typeof decision.preset).toBe("string");
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 2.2, 2.3**
     *
     * For any ConfirmationPoint, when mode is interactive,
     * resolveConfirmation returns action: "wait_for_user" with no preset.
     */
    it("interactive mode returns wait_for_user with no preset for all confirmation points", () => {
        fc.assert(fc.property(confirmationPointArb, (point) => {
            const decision = resolveConfirmation("interactive", point);
            expect(decision.action).toBe("wait_for_user");
            expect(decision.preset).toBeUndefined();
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 2.2, 2.3**
     *
     * Ship stage preset in autonomous mode should be "keep branch".
     */
    it("ship_method preset in autonomous mode is 'keep branch'", () => {
        fc.assert(fc.property(fc.constant("ship_method"), (point) => {
            const decision = resolveConfirmation("autonomous", point);
            expect(decision.action).toBe("auto");
            expect(decision.preset).toBe("keep branch");
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 2.2, 2.3**
     *
     * For any mode and any confirmation point, the decision is deterministic:
     * same inputs always produce the same output.
     */
    it("resolveConfirmation is deterministic for any mode and point", () => {
        fc.assert(fc.property(executionModeArb, confirmationPointArb, (mode, point) => {
            const decision1 = resolveConfirmation(mode, point);
            const decision2 = resolveConfirmation(mode, point);
            expect(decision1).toEqual(decision2);
        }), { numRuns: 50 });
    });
});
// ---------------------------------------------------------------------------
// Property: 新增 ConfirmationPoint autonomous 全自動
// ---------------------------------------------------------------------------
describe("Property: 新增 ConfirmationPoint autonomous 全自動", () => {
    /**
     * **Validates: Requirements 10.1, 10.3**
     *
     * For any new ConfirmationPoint, when mode is autonomous,
     * resolveConfirmation returns action: "auto" with a defined preset.
     */
    it("autonomous mode returns auto with preset for all new confirmation points", () => {
        fc.assert(fc.property(newConfirmationPointArb, (point) => {
            const decision = resolveConfirmation("autonomous", point);
            expect(decision.action).toBe("auto");
            expect(decision.preset).toBeDefined();
            expect(typeof decision.preset).toBe("string");
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 10.2, 10.3**
     *
     * For any new ConfirmationPoint, when mode is autonomous,
     * resolveConfirmation returns the correct preset value.
     */
    it("autonomous mode returns correct preset for each new confirmation point", () => {
        const expectedPresets = {
            refactor_scan_select: "auto-select-recommended",
            refactor_design_review: "auto-approve",
            refactor_apply_step: "continue",
            fix_report_confirm: "auto-confirm",
            fix_analyze_confirm: "auto-recommend",
            fix_apply_verify: "auto-verify",
        };
        fc.assert(fc.property(newConfirmationPointArb, (point) => {
            const decision = resolveConfirmation("autonomous", point);
            expect(decision.action).toBe("auto");
            expect(decision.preset).toBe(expectedPresets[point]);
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 10.1, 10.3**
     *
     * For any new ConfirmationPoint, when mode is interactive,
     * resolveConfirmation returns action: "wait_for_user" with no preset.
     */
    it("interactive mode returns wait_for_user for all new confirmation points", () => {
        fc.assert(fc.property(newConfirmationPointArb, (point) => {
            const decision = resolveConfirmation("interactive", point);
            expect(decision.action).toBe("wait_for_user");
            expect(decision.preset).toBeUndefined();
        }), { numRuns: 50 });
    });
});
// ---------------------------------------------------------------------------
// Property: 現有 ConfirmationPoint 向後兼容
// ---------------------------------------------------------------------------
describe("Property: 現有 ConfirmationPoint 向後兼容", () => {
    /**
     * **Validates: Requirements 10.4, 12.2**
     *
     * For any original ConfirmationPoint, autonomous mode behavior
     * is unchanged after adding new confirmation points.
     */
    it("original confirmation points still return auto with correct presets in autonomous mode", () => {
        const originalPresets = {
            router_tier: "auto-detect",
            plan_approval: "auto-approve",
            build_pause: "continue",
            review_p0p1: "auto-fix",
            ship_method: "keep branch",
        };
        fc.assert(fc.property(originalConfirmationPointArb, (point) => {
            const decision = resolveConfirmation("autonomous", point);
            expect(decision.action).toBe("auto");
            expect(decision.preset).toBe(originalPresets[point]);
        }), { numRuns: 50 });
    });
    /**
     * **Validates: Requirements 10.4, 12.2**
     *
     * For any original ConfirmationPoint, interactive mode behavior
     * is unchanged after adding new confirmation points.
     */
    it("original confirmation points still return wait_for_user in interactive mode", () => {
        fc.assert(fc.property(originalConfirmationPointArb, (point) => {
            const decision = resolveConfirmation("interactive", point);
            expect(decision.action).toBe("wait_for_user");
            expect(decision.preset).toBeUndefined();
        }), { numRuns: 50 });
    });
});
//# sourceMappingURL=execution-mode.property.test.js.map