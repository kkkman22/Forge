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

// P2-4: delegate frontmatter parsing to the authoritative module + adapter
// (was a private character-identical clone of frontmatter.ts).
import { parseFrontmatterPreservingLeading } from "./frontmatter.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
export type ConfirmationPoint =
  | "router_tier"
  | "plan_approval"
  | "build_pause"
  | "review_p0p1"
  | "ship_method"
  // ★ 新增：重構流程
  | "refactor_scan_select"
  | "refactor_design_review"
  | "refactor_apply_step"
  // ★ 新增：Bug 修復流程
  | "fix_report_confirm"
  | "fix_analyze_confirm"
  | "fix_apply_verify";

/** Decision result for a confirmation point. */
export interface ConfirmationDecision {
  /** Whether to proceed automatically or wait for user input. */
  action: "auto" | "wait_for_user";
  /** Preset value used in autonomous mode (e.g. "keep branch" for ship). */
  preset?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Valid ship_default_method configuration values. */
const VALID_DELIVERY_METHODS: readonly DeliveryMethod[] = [
  "merge",
  "push-pr",
  "keep-branch",
  "prompt",
];

const VALID_DELIVERY_METHODS_SET: ReadonlySet<string> = new Set(VALID_DELIVERY_METHODS);

/** YAML frontmatter delimiter. */
const FRONTMATTER_DELIMITER = "---";

/** Default execution mode when mode field is missing or unparseable. */
const DEFAULT_MODE: ExecutionMode = "interactive";

/** Valid execution mode values. */
const VALID_MODES: ReadonlySet<string> = new Set(["interactive", "autonomous"]);

/**
 * Preset strategies for each confirmation point in autonomous mode.
 * Ship stage defaults to "keep branch" as the safest delivery option.
 */
const AUTONOMOUS_PRESETS: Record<ConfirmationPoint, string> = {
  router_tier: "auto-detect",
  plan_approval: "auto-approve",
  build_pause: "continue",
  review_p0p1: "auto-fix",
  ship_method: "keep branch",
  // ★ 新增：重構流程
  refactor_scan_select: "auto-select-recommended",
  refactor_design_review: "auto-approve",
  refactor_apply_step: "continue",
  // ★ 新增：Bug 修復流程
  fix_report_confirm: "auto-confirm",
  fix_analyze_confirm: "auto-recommend",
  fix_apply_verify: "auto-verify",
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parse YAML frontmatter from StatusFile content.
 * Returns the frontmatter block (without delimiters) and the body after it.
 * Returns null if no valid frontmatter is found.
 */
function parseFrontmatter(content: string): {
  frontmatter: string;
  body: string;
  leadingWhitespace: string;
} | null {
  // P2-4: delegate to the authoritative adapter (was a private clone).
  return parseFrontmatterPreservingLeading(content);
}

/**
 * Reconstruct StatusFile content from frontmatter lines and body.
 */
function buildContent(frontmatterLines: string[], body: string, leadingWhitespace: string): string {
  const fm = frontmatterLines.filter((line) => line.trim() !== "").join("\n");
  const frontmatterBlock = `${FRONTMATTER_DELIMITER}\n${fm}\n${FRONTMATTER_DELIMITER}`;
  if (body) {
    return `${leadingWhitespace}${frontmatterBlock}\n${body}`;
  }
  return `${leadingWhitespace}${frontmatterBlock}\n`;
}

/**
 * Parse frontmatter into individual lines, filtering out empty lines.
 */
function getFrontmatterLines(frontmatter: string): string[] {
  return frontmatter.split("\n").filter((line) => line.trim() !== "");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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
export function parseShipDefaultMethod(value: string | undefined): {
  method: DeliveryMethod;
  warning?: string;
} {
  if (!value) {
    return { method: "keep-branch" };
  }

  const trimmed = value.trim().toLowerCase();
  if (VALID_DELIVERY_METHODS_SET.has(trimmed)) {
    return { method: trimmed as (typeof VALID_DELIVERY_METHODS)[number] };
  }

  return {
    method: "keep-branch",
    warning: `Invalid ship_default_method "${value}", falling back to "keep-branch". Valid: ${VALID_DELIVERY_METHODS.join(", ")}`,
  };
}

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
export function getExecutionMode(statusContent: string): ExecutionMode {
  const parsed = parseFrontmatter(statusContent);
  if (!parsed) {
    return DEFAULT_MODE;
  }

  const modeMatch = parsed.frontmatter.match(/^mode:\s*"?([^"\n]*)"?\s*$/m);
  if (!modeMatch) {
    return DEFAULT_MODE;
  }

  const value = modeMatch[1].trim();
  if (VALID_MODES.has(value)) {
    return value as ExecutionMode;
  }

  return DEFAULT_MODE;
}

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
export function writeExecutionMode(statusContent: string, mode: ExecutionMode): string {
  const parsed = parseFrontmatter(statusContent);

  if (!parsed) {
    // No frontmatter — create one with the mode field
    const trimmed = statusContent.trimStart();
    return `${FRONTMATTER_DELIMITER}\nmode: "${mode}"\n${FRONTMATTER_DELIMITER}\n${trimmed}`;
  }

  const lines = getFrontmatterLines(parsed.frontmatter);
  const modeLineIndex = lines.findIndex((line) => /^mode:\s/.test(line));

  if (modeLineIndex !== -1) {
    lines[modeLineIndex] = `mode: "${mode}"`;
  } else {
    lines.push(`mode: "${mode}"`);
  }

  return buildContent(lines, parsed.body, parsed.leadingWhitespace);
}

/**
 * Remove the mode field from StatusFile content.
 *
 * If the content has valid YAML frontmatter, removes the `mode` field line.
 * Preserves all other fields. If no frontmatter exists, returns content unchanged.
 *
 * @param statusContent - Raw StatusFile content string.
 * @returns Updated StatusFile content string with mode field removed.
 */
export function clearExecutionMode(statusContent: string): string {
  const parsed = parseFrontmatter(statusContent);

  if (!parsed) {
    return statusContent;
  }

  const lines = getFrontmatterLines(parsed.frontmatter);
  const filtered = lines.filter((line) => !/^mode:\s/.test(line));

  return buildContent(filtered, parsed.body, parsed.leadingWhitespace);
}

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
export function resolveConfirmation(
  mode: ExecutionMode,
  point: ConfirmationPoint,
  configOverride?: Partial<Record<ConfirmationPoint, string>>,
): ConfirmationDecision {
  if (mode === "autonomous") {
    const preset = configOverride?.[point] ?? AUTONOMOUS_PRESETS[point];

    if (preset === "prompt") {
      return { action: "wait_for_user" };
    }

    return {
      action: "auto",
      preset,
    };
  }

  return { action: "wait_for_user" };
}
