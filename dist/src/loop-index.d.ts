/**
 * Unified entry point for the autonomous loop pure-function modules.
 *
 * Re-exports all public APIs from the eight core modules so that
 * consumers can import everything from a single path:
 *
 * ```ts
 * import { createInitialState, transition, buildCommitCommand } from "./loop-index.js";
 * ```
 *
 * Design reference: gnhf-inspired-enhancements
 * **Validates: Requirements 1.1–9.6**
 */
export type { AgentInterface, AgentName, AgentOutput, AgentOutputSchema, AgentResult, AgentRunOptions, FailureKind, FailureState, GitCommand, IterationEntry, LoopConfig, NotesDocument, OrchestratorEffect, OrchestratorEvent, OrchestratorState, RunLimits, SchemaProperty, SleepPreventionCommand, TokenUsage, WorktreeDecision, } from "./loop-types.js";
export { applyFailure, applySuccess, calculateBackoffMs, createInitialFailureState, shouldCircuitBreak, } from "./failure-handler.js";
export { buildAddAllCommand, buildCleanCommand, buildCommitCommand, buildResetCommand, buildStashCommand, containsShellMetacharacters, sanitizeBranchName, validatePathSafety, } from "./git-transaction.js";
export { appendEntry, buildIterationPrompt, formatIterationEntry, formatNotesDocument, parseNotesDocument, } from "./context-accumulator.js";
export type { ValidationError, ValidationResult, ValidationSuccess } from "./agent-output.js";
export { buildAgentOutputSchema, deserializeAgentOutput, serializeAgentOutput, toStringArray, validateAgentOutput, } from "./agent-output.js";
export type { SupportedPlatform } from "./sleep-preventer.js";
export { buildCaffeinateCommand, buildPowerShellCommand, buildSleepPreventionCommand, buildSystemdInhibitCommand, isSupportedPlatform, } from "./sleep-preventer.js";
export { getUnsupportedAgentError, isValidAgentName, SUPPORTED_AGENTS } from "./agent-adapter.js";
export { canCreateWorktree, computeWorktreeDir, computeWorktreePath, decideWorktreeCleanup, isValidWorktreeSource, } from "./worktree-manager.js";
export { createInitialState, formatCommitMessage, shouldAbort, transition, } from "./orchestrator.js";
