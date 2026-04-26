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

// ---------------------------------------------------------------------------
// 1. Shared types (type-only re-exports to avoid runtime overhead)
// ---------------------------------------------------------------------------

export type {
  AgentInterface,
  AgentName,
  AgentOutput,
  AgentOutputSchema,
  AgentResult,
  AgentRunOptions,
  FailureKind,
  FailureState,
  GitCommand,
  IterationEntry,
  LoopConfig,
  NotesDocument,
  OrchestratorEffect,
  OrchestratorEvent,
  OrchestratorState,
  RunLimits,
  SchemaProperty,
  SleepPreventionCommand,
  TokenUsage,
  WorktreeDecision,
} from "./loop-types.js";

// ---------------------------------------------------------------------------
// 2. Failure handler
// ---------------------------------------------------------------------------

export {
  applyFailure,
  applySuccess,
  calculateBackoffMs,
  createInitialFailureState,
  shouldCircuitBreak,
} from "./failure-handler.js";

// ---------------------------------------------------------------------------
// 3. Git transaction
// ---------------------------------------------------------------------------

export {
  buildAddAllCommand,
  buildCleanCommand,
  buildCommitCommand,
  buildResetCommand,
  buildStashCommand,
  containsShellMetacharacters,
  sanitizeBranchName,
  validatePathSafety,
} from "./git-transaction.js";

// ---------------------------------------------------------------------------
// 4. Context accumulator
// ---------------------------------------------------------------------------

export {
  appendEntry,
  buildIterationPrompt,
  formatIterationEntry,
  formatNotesDocument,
  parseNotesDocument,
} from "./context-accumulator.js";

// ---------------------------------------------------------------------------
// 5. Agent output (functions + types)
// ---------------------------------------------------------------------------

export type { ValidationError, ValidationResult, ValidationSuccess } from "./agent-output.js";
export {
  buildAgentOutputSchema,
  deserializeAgentOutput,
  serializeAgentOutput,
  toStringArray,
  validateAgentOutput,
} from "./agent-output.js";

// ---------------------------------------------------------------------------
// 6. Sleep preventer (functions + type)
// ---------------------------------------------------------------------------

export type { SupportedPlatform } from "./sleep-preventer.js";
export {
  buildCaffeinateCommand,
  buildPowerShellCommand,
  buildSleepPreventionCommand,
  buildSystemdInhibitCommand,
  isSupportedPlatform,
} from "./sleep-preventer.js";

// ---------------------------------------------------------------------------
// 7. Agent adapter
// ---------------------------------------------------------------------------

export { getUnsupportedAgentError, isValidAgentName, SUPPORTED_AGENTS } from "./agent-adapter.js";

// ---------------------------------------------------------------------------
// 8. Worktree manager
// ---------------------------------------------------------------------------

export {
  canCreateWorktree,
  computeWorktreeDir,
  computeWorktreePath,
  decideWorktreeCleanup,
  isValidWorktreeSource,
} from "./worktree-manager.js";

// ---------------------------------------------------------------------------
// 9. Orchestrator
// ---------------------------------------------------------------------------

export {
  createInitialState,
  formatCommitMessage,
  shouldAbort,
  transition,
} from "./orchestrator.js";
