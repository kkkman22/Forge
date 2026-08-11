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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  HookCallback,
  HookJSONOutput,
  PostToolUseHookSpecificOutput,
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
  if (filePath.includes(".tinkerman/specs/")) {
    return {
      category: "frozen-spec",
      reason_code: "SPEC_LOCKED",
      suggested_alternative_path: `.tinkerman/findings/${filePath.split("/").pop()?.replace(".md", "") ?? "topic"}.md`,
    };
  }
  if (filePath.includes(".tinkerman/plans/")) {
    return {
      category: "frozen-plan",
      reason_code: "PLAN_APPROVED",
      suggested_alternative_path: ".tinkerman/progress/",
    };
  }
  if (filePath.endsWith(".tinkerman/config.md") || filePath.includes(".tinkerman/config")) {
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
  const lines = ["Reminder: state changes belong in .tinkerman/status.md, not in frozen files."];
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
      "move the spec to draft status via /tinkerman spec, or record findings in .tinkerman/findings/.",
    PLAN_APPROVED:
      "re-open the plan via /tinkerman plan, or track progress in .tinkerman/progress/.",
    CONFIG_ROOT:
      "propose config changes via a new spec; do not edit .tinkerman/config.md directly.",
    ZONE_OVERRIDE_MISSING:
      "add an explicit Zone_Registry override in .tinkerman/config.md or move the file out of the frozen zone.",
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

// ---------------------------------------------------------------------------
// PostToolUse defence-in-depth (frozen-zone-structured-feedback R3)
// ---------------------------------------------------------------------------
//
// If a Write/Edit/MultiEdit somehow bypassed the PreToolUse deny (parallel
// tools, rare race), this PostToolUse hook detects the breach after the fact,
// overwrites the tool's success output with a Frozen_Diagnostic revert prompt,
// and writes an audit record. It does NOT undo the write (R3.4) — reporting
// only; reversal is the user's job or /rewind's.

/** Input shape for the breach-audit writer. */
export interface FrozenBreachRecord {
  /** Absolute or project-relative path that was written. */
  attemptedPath: string;
  /** Tool that performed the write (Write / Edit / MultiEdit). */
  toolName: string;
  /** Raw tool_input (serialized to JSON in the audit record). */
  toolInput: Record<string, unknown>;
  /** The structured diagnostic explaining why the path is frozen. */
  diagnostic: FrozenDiagnostic;
  /** ISO timestamp of the breach detection. */
  detectedAt: string;
}

/**
 * Render a Frozen_Diagnostic as the post-hoc revert prompt (R3.2).
 * Prefixed with the spec-mandated marker so the model recognizes the breach.
 */
export function renderPostHocViolation(diag: FrozenDiagnostic): string {
  return `⚠ Post-hoc frozen-zone violation detected: ${diag.path} [${diag.category}|${diag.reason_code}] — ${diag.reason_text}. This write should not have succeeded. Revert the change (the PreToolUse hook is the authority; this is defence-in-depth). To unlock legitimately: ${diag.unlock_instruction}`;
}

/**
 * Write a breach audit record to `.tinkerman/runs/<timestamp>-frozen-breach.md`
 * (R3.3). Best-effort: never throws (a failed audit log must not crash the hook).
 * @param forgeRoot absolute path to the .forge directory's parent
 * @param record the breach record
 * @returns the path written, or null if the write failed
 */
export function writeFrozenBreachRecord(
  forgeRoot: string,
  record: FrozenBreachRecord,
): string | null {
  try {
    // forgeRoot is the project root (parent of .tinkerman/). Per R3.3 the audit
    // record lives at .tinkerman/runs/<stamp>-frozen-breach.md.
    const runsDir = join(forgeRoot, ".tinkerman", "runs");
    mkdirSync(runsDir, { recursive: true });
    // Timestamp safe for filenames (no colons).
    const stamp = record.detectedAt.replace(/[:.]/g, "-");
    const filePath = join(runsDir, `${stamp}-frozen-breach.md`);
    const body = [
      "---",
      `attempted_path: "${record.attemptedPath}"`,
      `tool_name: "${record.toolName}"`,
      `detected_at: "${record.detectedAt}"`,
      `category: "${record.diagnostic.category}"`,
      `reason_code: "${record.diagnostic.reason_code}"`,
      "---",
      "",
      "# Post-hoc Frozen-Zone Breach",
      "",
      `A write to a frozen-zone file slipped past the PreToolUse deny hook`,
      `(parallel tools or a rare race). The write was NOT auto-reverted; the`,
      `operator must revert manually or via /rewind.`,
      "",
      "## Details",
      "",
      `- **Path**: \`${record.attemptedPath}\``,
      `- **Tool**: \`${record.toolName}\``,
      `- **Category**: ${record.diagnostic.category}`,
      `- **Reason code**: ${record.diagnostic.reason_code}`,
      `- **Reason**: ${record.diagnostic.reason_text}`,
      `- **Detected at**: ${record.detectedAt}`,
      "",
      "## Tool input",
      "",
      "```json",
      JSON.stringify(record.toolInput, null, 2),
      "```",
      "",
      "## Recommended action",
      "",
      record.diagnostic.unlock_instruction,
      "",
    ].join("\n");
    writeFileSync(filePath, body, "utf-8");
    return filePath;
  } catch {
    // R3.3 is best-effort; a failed audit log must not crash the hook.
    return null;
  }
}

/**
 * Create a PostToolUse defence-in-depth hook for the frozen zone (R3).
 *
 * After a Write/Edit/MultiEdit executes, re-checks the target path; if it is
 * frozen (locked/approved) yet the write succeeded, overwrites the tool output
 * with a revert prompt (R3.1/R3.2) and writes a breach audit record (R3.3).
 * Does NOT undo the write (R3.4).
 *
 * @param forgeRoot absolute path to the project root (parent of .tinkerman/)
 */
export function createFrozenZonePostToolUseHook(forgeRoot: string): HookCallback {
  return async (input, _toolUseId, _options): Promise<HookJSONOutput> => {
    const postInput = input as {
      tool_name?: string;
      tool_input?: Record<string, unknown>;
    };

    const toolName = postInput.tool_name ?? "";
    // R3.1: scope to Write-class tools.
    if (toolName !== "Write" && toolName !== "Edit" && toolName !== "MultiEdit") {
      return {};
    }

    const toolInput = postInput.tool_input ?? {};
    const filePath = (toolInput.file_path ?? toolInput.path ?? "") as string;
    if (!filePath) return {};

    // Re-check against the frozen zone.
    if (!isFrozenZonePath(filePath)) return {};
    if (!existsSync(filePath)) return {};

    const content = readFileSync(filePath, "utf-8");
    const status = extractStatus(content);
    const frozenStatuses = ["locked", "approved"];
    if (!status || !frozenStatuses.includes(status)) return {};

    // Breach detected: build the diagnostic, overwrite tool output, audit.
    const diagnostic = buildFrozenDiagnostic(filePath, status);
    const detectedAt = new Date().toISOString();

    // R3.3: write the audit record (best-effort).
    writeFrozenBreachRecord(forgeRoot, {
      attemptedPath: filePath,
      toolName,
      toolInput,
      diagnostic,
      detectedAt,
    });

    // R3.1/R3.2: overwrite the tool's success message with the revert prompt.
    const postOutput: PostToolUseHookSpecificOutput = {
      hookEventName: "PostToolUse",
      updatedToolOutput: renderPostHocViolation(diagnostic),
      additionalContext:
        "Defence-in-depth: the PreToolUse frozen-zone hook should have blocked this. Revert the change; do not retry.",
    };
    return { hookSpecificOutput: postOutput };
  };
}
