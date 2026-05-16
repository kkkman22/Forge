/**
 * Frozen Zone Programmatic Hook — SDK PreToolUse hook for frozen zone protection.
 *
 * Replaces the old shell hook (hooks.json check-frozen bash command).
 * Returns deny for Write/Edit on files in frozen zone with locked/approved status.
 */
import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";
/**
 * Create a frozen zone protection SDK programmatic hook.
 */
export declare function createFrozenZoneHook(_cwd: string): HookCallback;
