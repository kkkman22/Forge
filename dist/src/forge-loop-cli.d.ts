#!/usr/bin/env node
/**
 * CLI entry point — Commander-based program that parses arguments, validates
 * preconditions, sets up the run, and starts the autonomous loop driver.
 *
 * Responsibilities:
 * - Parse positional `objective` and named options
 * - Validate git repo state (clean working tree, valid branch for worktree)
 * - Pre-warm the Agent SDK via `startup()`
 * - Spawn sleep prevention process if enabled
 * - Wire signal handlers for graceful shutdown
 * - Start the driver loop and handle cleanup on exit
 *
 * Design reference: sdk-autonomous-loop § forge-loop-cli.ts
 * **Validates: Requirements 1.4, 1.6, 6.1–6.10, 4.5, 4.6, 4.7**
 */
/**
 * Default base delay in milliseconds for exponential backoff on hard failures.
 * Used as the default value for `LoopConfig.backoffBaseMs`.
 */
export declare const DEFAULT_BACKOFF_BASE_MS = 60000;
/**
 * Default maximum number of concurrent Git worktrees allowed.
 * Used as the default value for `LoopConfig.maxConcurrentWorktrees`.
 */
export declare const DEFAULT_MAX_CONCURRENT_WORKTREES = 3;
/** Known routing tiers for --tier validation. */
export declare const VALID_TIERS: ReadonlySet<string>;
/** Supported locale codes for --lang validation. */
export declare const SUPPORTED_LOCALES: ReadonlySet<string>;
/**
 * Copy the notes file from a worktree to the main repo's run directory
 * before the worktree is deleted.
 *
 * This ensures iteration history is preserved even when the worktree is
 * removed after a zero-commit run. On any failure (missing source file,
 * permission error, etc.) the function returns `{ success: false }` with
 * an error description — callers should warn but not block worktree
 * deletion.
 *
 * @param worktreeNotesPath  Absolute path to the notes.md inside the worktree.
 * @param mainRepoRunDir     Absolute path to the main repo `.forge/runs/<runId>/` directory.
 * @returns `{ success: true }` on success, `{ success: false, error }` on failure.
 */
export declare function backupWorktreeNotes(worktreeNotesPath: string, mainRepoRunDir: string): {
    success: boolean;
    error?: string;
};
