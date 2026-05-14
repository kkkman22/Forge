/**
 * Execution mode abstraction layer — pure functions for managing
 * interactive vs autonomous execution modes in the StatusFile.
 *
 * All functions are pure: they accept data and return results without
 * side effects. The SKILL layer is responsible for actual I/O.
 *
 * Design reference: loop-skills-fusion § execution-mode.ts
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7**
 */
/** Execution mode: interactive (human confirms) or autonomous (auto-decide). */
export type ExecutionMode = "interactive" | "autonomous";
/** Ship delivery method configuration. */
export type DeliveryMethod = "merge" | "push-pr" | "keep-branch" | "prompt";
/** Actual Ship delivery action (excludes meta-option "prompt", includes destructive "discard"). */
export type ShipDeliveryOption = "merge" | "push-pr" | "keep-branch" | "discard";
/**
 * Confirmation points where autonomous mode applies preset strategies
 * instead of waiting for user input.
 */
export type ConfirmationPoint = "router_tier" | "plan_approval" | "build_pause" | "review_p0p1" | "ship_method" | "refactor_scan_select" | "refactor_design_review" | "refactor_apply_step" | "fix_report_confirm" | "fix_analyze_confirm" | "fix_apply_verify";
/** Decision result for a confirmation point. */
export interface ConfirmationDecision {
    /** Whether to proceed automatically or wait for user input. */
    action: "auto" | "wait_for_user";
    /** Preset value used in autonomous mode (e.g. "keep branch" for ship). */
    preset?: string;
}
/**
 * Parse a `ship_default_method` configuration value (pure function).
 *
 * Invalid values fall back to `"keep-branch"` with a warning message.
 * Undefined input (missing config) returns `"keep-branch"` silently
 * for backward compatibility.
 *
 * @param value  The raw config value, or undefined if not configured.
 * @returns The parsed delivery method, with an optional warning.
 */
export declare function parseShipDefaultMethod(value: string | undefined): {
    method: DeliveryMethod;
    warning?: string;
};
/**
 * Extract the execution mode from StatusFile content.
 *
 * Parses the YAML frontmatter and looks for a `mode` field.
 * Returns `"interactive"` when the mode field is missing, the content
 * has no valid frontmatter, or the value is not a recognized mode.
 *
 * @param statusContent - Raw StatusFile content string.
 * @returns The current execution mode.
 */
export declare function getExecutionMode(statusContent: string): ExecutionMode;
/**
 * Write the mode field into StatusFile content.
 *
 * If the content has valid YAML frontmatter, updates or adds the `mode` field.
 * If the content has no frontmatter, wraps it in new frontmatter with the mode field.
 * Preserves all other fields in the frontmatter.
 *
 * @param statusContent - Raw StatusFile content string.
 * @param mode - The execution mode to write.
 * @returns Updated StatusFile content string.
 */
export declare function writeExecutionMode(statusContent: string, mode: ExecutionMode): string;
/**
 * Remove the mode field from StatusFile content.
 *
 * If the content has valid YAML frontmatter, removes the `mode` field line.
 * Preserves all other fields. If no frontmatter exists, returns content unchanged.
 *
 * @param statusContent - Raw StatusFile content string.
 * @returns Updated StatusFile content string with mode field removed.
 */
export declare function clearExecutionMode(statusContent: string): string;
/**
 * Resolve a confirmation point decision based on the current execution mode.
 *
 * In autonomous mode, all confirmation points return `action: "auto"` with
 * a preset strategy. The Ship stage preset is "keep branch" (safest option).
 * When `configOverride` provides a value for `ship_method`, it takes
 * precedence over the hardcoded preset.
 *
 * In interactive mode, all confirmation points return `action: "wait_for_user"`.
 *
 * @param mode            The current execution mode.
 * @param point           The confirmation point to resolve.
 * @param configOverride  Optional per-point configuration overrides.
 * @returns The confirmation decision.
 */
export declare function resolveConfirmation(mode: ExecutionMode, point: ConfirmationPoint, configOverride?: Partial<Record<ConfirmationPoint, string>>): ConfirmationDecision;
