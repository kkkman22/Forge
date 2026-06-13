/**
 * Frozen Zone Programmatic Hook — SDK PreToolUse hook for frozen zone protection.
 *
 * Replaces the old shell hook (hooks.json check-frozen bash command).
 * Returns deny for Write/Edit on files in frozen zone with locked/approved status.
 *
 * Emits a structured Frozen_Diagnostic (frozen-zone-structured-feedback R1/R2):
 *   - R1: structured object {path, category, reason_code, reason_text,
 *     suggested_alternative_path, unlock_instruction} instead of a raw string.
 *   - R2: the diagnostic is rendered into systemMessage (concise) +
 *     additionalContext (suggested alternative + status.md reminder), keeping
 *     model context minimal while giving the agent actionable guidance.
 */

import { existsSync, readFileSync } from "node:fs";
import type {
  HookCallback,
  HookJSONOutput,
  PreToolUseHookSpecificOutput,
} from "@anthropic-ai/claude-agent-sdk";
import { extractStatus, isFrozenZonePath } from "./check-frozen.js";

/** Frozen-zone category (frozen-zone-structured-feedback R1.1). */
export type FrozenCategory = "frozen-spec" | "frozen-plan" | "frozen-config";

/** Fixed reason-code enum (R1.2). New codes require a Zone_Registry + fixture update. */
export type FrozenReasonCode =
  | "SPEC_LOCKED"
  | "PLAN_APPROVED"
  | "CONFIG_ROOT"
  | "ZONE_OVERRIDE_MISSING";

/** Structured Frozen_Diagnostic (R1.1). Serializable to JSON and Markdown. */
export interface FrozenDiagnostic {
  path: string;
  category: FrozenCategory;
  reason_code: FrozenReasonCode;
  reason_text: string;
  suggested_alternative_path?: string;
  unlock_instruction: string;
}

/** Classify a frozen path into a category + reason code (R1.4: most restrictive wins). */
function classifyFrozenPath(
  filePath: string,
  status: string,
): {
  category: FrozenCategory;
  reason_code: FrozenReasonCode;
  suggested_alternative_path?: string;
} {
  if (filePath.includes(".forge/specs/")) {
    return {
      category: "frozen-spec",
      reason_code: "SPEC_LOCKED",
      suggested_alternative_path: `.forge/findings/${filePath.split("/").pop()?.replace(".md", "") ?? "topic"}.md`,
    };
  }
  if (filePath.includes(".forge/plans/")) {
    return {
      category: "frozen-plan",
      reason_code: "PLAN_APPROVED",
      suggested_alternative_path: ".forge/progress/",
    };
  }
  if (filePath.endsWith(".forge/config.md") || filePath.includes(".forge/config")) {
    return { category: "frozen-config", reason_code: "CONFIG_ROOT" };
  }
  // Path is in the frozen zone but not a known sub-category → generic override.
  return {
    category: status === "locked" ? "frozen-spec" : "frozen-plan",
    reason_code: "ZONE_OVERRIDE_MISSING",
  };
}

/** Render the concise systemMessage (R2.3: no large tables, minimal context). */
function renderSystemMessage(diag: FrozenDiagnostic): string {
  return `Frozen zone: ${diag.path} [${diag.category}|${diag.reason_code}] — ${diag.reason_text} To unlock: ${diag.unlock_instruction}`;
}

/** Render the additionalContext with the suggested alternative + status reminder (R2.4). */
function renderAdditionalContext(diag: FrozenDiagnostic): string {
  const lines = ["Reminder: state changes belong in .forge/status.md, not in frozen files."];
  if (diag.suggested_alternative_path) {
    lines.unshift(
      `Suggested alternative: consider writing to ${diag.suggested_alternative_path} instead.`,
    );
  }
  return lines.join(" ");
}

/** Build a Frozen_Diagnostic from the raw path + status. */
function buildFrozenDiagnostic(filePath: string, status: string): FrozenDiagnostic {
  const { category, reason_code, suggested_alternative_path } = classifyFrozenPath(
    filePath,
    status,
  );
  const unlock: Record<FrozenReasonCode, string> = {
    SPEC_LOCKED:
      "move the spec to draft status via /forge spec, or record findings in .forge/findings/.",
    PLAN_APPROVED: "re-open the plan via /forge plan, or track progress in .forge/progress/.",
    CONFIG_ROOT: "propose config changes via a new spec; do not edit .forge/config.md directly.",
    ZONE_OVERRIDE_MISSING:
      "add an explicit Zone_Registry override in .forge/config.md or move the file out of the frozen zone.",
  };
  return {
    path: filePath,
    category,
    reason_code,
    reason_text: `status "${status}" forbids modification`,
    suggested_alternative_path,
    unlock_instruction: unlock[reason_code],
  };
}

/**
 * Create a frozen zone protection SDK programmatic hook.
 */
export function createFrozenZoneHook(_cwd: string): HookCallback {
  return async (input, _toolUseId, _options): Promise<HookJSONOutput> => {
    const preInput = input as {
      tool_name?: string;
      tool_input?: Record<string, unknown>;
    };

    const toolName = preInput.tool_name ?? "";
    if (toolName !== "Write" && toolName !== "Edit") {
      return {};
    }

    const toolInput = preInput.tool_input ?? {};
    const filePath = (toolInput.file_path ?? toolInput.path ?? "") as string;
    if (!filePath) return {};

    // Check if path is in frozen zone
    if (!isFrozenZonePath(filePath)) return {};

    // File doesn't exist yet — new files always allowed
    if (!existsSync(filePath)) return {};

    // Check frontmatter status
    const content = readFileSync(filePath, "utf-8");
    const status = extractStatus(content);
    const frozenStatuses = ["locked", "approved"];

    if (status && frozenStatuses.includes(status)) {
      // R1: build the structured diagnostic.
      const diagnostic = buildFrozenDiagnostic(filePath, status);
      // R2: render concise systemMessage + additionalContext for the model.
      const denyOutput: PreToolUseHookSpecificOutput = {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: renderSystemMessage(diagnostic),
        additionalContext: renderAdditionalContext(diagnostic),
      };
      return { hookSpecificOutput: denyOutput };
    }

    return {};
  };
}
