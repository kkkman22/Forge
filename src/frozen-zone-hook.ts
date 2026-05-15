/**
 * Frozen Zone Programmatic Hook — SDK PreToolUse hook for frozen zone protection.
 *
 * Replaces the old shell hook (hooks.json check-frozen bash command).
 * Returns deny for Write/Edit on files in frozen zone with locked/approved status.
 */

import { existsSync, readFileSync } from "node:fs";
import type {
  HookCallback,
  HookJSONOutput,
  PreToolUseHookSpecificOutput,
} from "@anthropic-ai/claude-agent-sdk";
import { extractStatus, isFrozenZonePath } from "./check-frozen.js";

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
      const denyOutput: PreToolUseHookSpecificOutput = {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `Frozen zone: ${filePath} has status "${status}" and cannot be modified`,
      };
      return { hookSpecificOutput: denyOutput };
    }

    return {};
  };
}
