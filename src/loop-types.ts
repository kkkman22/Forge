/**
 * Shared type definitions for the autonomous loop execution mode.
 *
 * All core data types used across the loop modules (orchestrator, git-transaction,
 * context-accumulator, agent-output, failure-handler, sleep-preventer,
 * agent-adapter, worktree-manager) are defined here to avoid circular
 * dependencies and provide a single source of truth.
 *
 * Design reference: gnhf-inspired-enhancements design document
 * **Validates: Requirements 1.1–1.8, 2.1–2.7, 3.1–3.7, 4.1–4.7,
 *   5.1–5.8, 6.1–6.7, 7.1–7.7, 8.1–8.7, 9.1–9.6**
 */

// ---------------------------------------------------------------------------
// Token usage (Requirements 9.1, 9.6)
// ---------------------------------------------------------------------------

/** Cumulative token counts for a single agent invocation. */
export interface TokenUsage {
  /** Number of input (prompt) tokens consumed. */
  inputTokens: number;
  /** Number of output (completion) tokens generated. */
  outputTokens: number;
  /** Number of tokens read from cache. */
  cacheReadTokens: number;
  /** Number of tokens written to cache. */
  cacheCreationTokens: number;
}

// ---------------------------------------------------------------------------
// Agent output (Requirements 4.1–4.7)
// ---------------------------------------------------------------------------

/** Structured JSON result returned by a subagent after each iteration. */
export interface AgentOutput {
  /** Whether the iteration completed successfully. */
  success: boolean;
  /** Human-readable summary of what the agent did. */
  summary: string;
  /** List of key changes made during this iteration. */
  key_changes_made: string[];
  /** List of key learnings discovered during this iteration. */
  key_learnings: string[];
  /** When true, signals the orchestrator to stop the run (used with --stop-when). */
  should_fully_stop?: boolean;
  /** ★ 新增：本轮完成的 SKILL 阶段 */
  skill_phase_completed?: string;
  /** ★ 新增：建议的下一个 SKILL 阶段 */
  next_skill_phase?: string;
  /** ★ 新增：质量门禁结果 */
  gate_result?: "passed" | "blocked" | "skipped";
}

/** JSON Schema property descriptor for agent output schema construction. */
export interface SchemaProperty {
  /** JSON Schema type (e.g. "boolean", "string", "array"). */
  type: string;
  /** For array types, describes the element type. */
  items?: { type: string };
}

/** JSON Schema object describing the expected agent output structure. */
export interface AgentOutputSchema {
  /** Always "object". */
  type: "object";
  /** Disallow extra properties for strict validation. */
  additionalProperties: false;
  /** Map of property names to their schema descriptors. */
  properties: Record<string, SchemaProperty>;
  /** All property names that must be present. */
  required: string[];
}

// ---------------------------------------------------------------------------
// Context accumulator (Requirements 3.1–3.7)
// ---------------------------------------------------------------------------

/** A single iteration's record in the cumulative notes document. */
export interface IterationEntry {
  /** 1-based iteration number. */
  number: number;
  /** Whether this iteration succeeded. */
  success: boolean;
  /** Human-readable summary of the iteration outcome. */
  summary: string;
  /** List of key changes made (empty for failed iterations). */
  keyChanges: string[];
  /** List of key learnings from this iteration. */
  keyLearnings: string[];
}

/** The full cumulative notes document maintained across iterations. */
export interface NotesDocument {
  /** Unique identifier for this run. */
  runId: string;
  /** Branch name associated with this run (optional for backward compatibility). */
  branchName?: string;
  /** Ordered list of iteration entries. */
  entries: IterationEntry[];
}

// ---------------------------------------------------------------------------
// Run limits and loop config (Requirements 1.5–1.7, 5.4–5.5, 8.7)
// ---------------------------------------------------------------------------

/** User-specified limits that control when the autonomous loop stops. */
export interface RunLimits {
  /** Maximum number of iterations before aborting. */
  maxIterations?: number;
  /** Maximum cumulative token usage (input + output) before aborting. */
  maxTokens?: number;
  /** Natural-language condition; agent sets should_fully_stop when met. */
  stopWhen?: string;
}

/** Configuration for the autonomous loop execution mode. */
export interface LoopConfig {
  /** Which agent to use for iterations. */
  agent: AgentName;
  /** Number of consecutive failures before the circuit breaker triggers. Default: 3. */
  maxConsecutiveFailures: number;
  /** Whether to prevent the OS from sleeping during the run. Default: true. */
  preventSleep: boolean;
  /** Base delay in ms for exponential backoff on hard failures. Default: 60000. */
  backoffBaseMs: number;
  /** Maximum number of concurrent worktrees allowed. Default: 3. */
  maxConcurrentWorktrees: number;
}

// ---------------------------------------------------------------------------
// Orchestrator state machine (Requirements 1.1–1.8)
// ---------------------------------------------------------------------------

/** The orchestrator's current state, updated after each event. */
export interface OrchestratorState {
  /** Current lifecycle phase of the orchestrator. */
  status: "idle" | "running" | "waiting" | "aborted" | "stopped";
  /** Current iteration number (0 before first iteration). */
  currentIteration: number;
  /** Cumulative input tokens across all iterations. */
  totalInputTokens: number;
  /** Cumulative output tokens across all iterations. */
  totalOutputTokens: number;
  /** Number of successful commits made. */
  commitCount: number;
  /** Number of successful iterations. */
  successCount: number;
  /** Number of failed iterations. */
  failCount: number;
  /** Count of consecutive failures (soft + hard). Reset on success. */
  consecutiveFailures: number;
  /** Count of consecutive hard errors. Reset on success or soft failure. */
  consecutiveErrors: number;
  /** Timestamp (ms) when backoff expires, or null if not waiting. */
  waitingUntilMs: number | null;
}

/**
 * Events that drive orchestrator state transitions.
 *
 * Each event represents something that happened (past tense) and triggers
 * a deterministic state transition via the `transition` function.
 */
export type OrchestratorEvent =
  | { type: "start"; limits: RunLimits }
  | { type: "iteration_success"; summary: string; tokenUsage: TokenUsage }
  | { type: "iteration_soft_failure"; summary: string; tokenUsage: TokenUsage }
  | { type: "iteration_hard_failure"; error: string; tokenUsage: TokenUsage }
  | { type: "stop_condition_met" }
  | { type: "user_interrupt" }
  | { type: "backoff_elapsed" };

/**
 * Side-effect descriptions produced by state transitions.
 *
 * Effects are pure data — the SKILL layer is responsible for executing them.
 */
export type OrchestratorEffect =
  | { type: "schedule_iteration"; iterationNumber: number }
  | { type: "commit"; message: string }
  | { type: "rollback" }
  | { type: "start_backoff"; durationMs: number }
  | { type: "abort"; reason: string }
  | { type: "stop" }
  | { type: "ship_merge"; targetBranch: string; featureBranch: string }
  | { type: "ship_push_pr"; remote: string; branch: string; title: string; body: string }
  | { type: "ship_discard"; branch: string };

// ---------------------------------------------------------------------------
// Failure handling (Requirements 5.1–5.8)
// ---------------------------------------------------------------------------

/** Classification of iteration failures. */
export type FailureKind = "soft" | "hard";

/** Mutable failure counters tracked by the orchestrator. */
export interface FailureState {
  /** Count of consecutive failures (soft + hard combined). */
  consecutiveFailures: number;
  /** Count of consecutive hard errors only. */
  consecutiveErrors: number;
}

// ---------------------------------------------------------------------------
// Git transaction (Requirements 2.1–2.7, 6.1–6.7)
// ---------------------------------------------------------------------------

/**
 * A safe Git command descriptor.
 *
 * Commands are represented as argv arrays to prevent shell injection.
 * The executable is always "git" — user input appears only in `args`.
 */
export interface GitCommand {
  /** Always "git". */
  executable: "git";
  /** Argument array passed directly to execFileSync (no shell). */
  args: string[];
}

// ---------------------------------------------------------------------------
// Sleep prevention (Requirements 8.1–8.7)
// ---------------------------------------------------------------------------

/** Platform-specific command to prevent the OS from sleeping. */
export interface SleepPreventionCommand {
  /** The executable to spawn (e.g. "caffeinate", "powershell.exe"). */
  command: string;
  /** Arguments for the command. */
  args: string[];
  /** Whether the child process should be detached from the parent. */
  detached: boolean;
}

// ---------------------------------------------------------------------------
// Worktree management (Requirements 7.1–7.7)
// ---------------------------------------------------------------------------

/** Decision about what to do with a worktree after a run completes. */
export interface WorktreeDecision {
  /** Whether to keep or remove the worktree. */
  action: "preserve" | "remove";
  /** Human-readable explanation for the decision. */
  reason: string;
}

// ---------------------------------------------------------------------------
// Agent abstraction (Requirements 9.1–9.6)
// ---------------------------------------------------------------------------

/** Supported agent identifiers. */
export type AgentName = "claude" | "codex" | "opencode" | "rovodev";

/** Options passed to an agent's `run` method. */
export interface AgentRunOptions {
  /** Callback for incremental token usage reporting. */
  onUsage?: (usage: TokenUsage) => void;
  /** Callback for streaming text output from the agent. */
  onMessage?: (text: string) => void;
  /** Abort signal for cancelling an in-progress run. */
  signal?: AbortSignal;
  /** Path to write iteration-level debug logs. */
  logPath?: string;
}

/** Result of a single agent run (one iteration). */
export interface AgentResult {
  /** The structured output from the agent. */
  output: AgentOutput;
  /** Token usage for this run. */
  usage: TokenUsage;
}

/** Unified interface that all agent adapters must implement. */
export interface AgentInterface {
  /** Human-readable agent name (e.g. "claude", "codex"). */
  name: string;
  /** Optional cleanup hook for releasing resources. */
  close?(): Promise<void> | void;
  /** Execute a single iteration with the given prompt. */
  run(prompt: string, cwd: string, options?: AgentRunOptions): Promise<AgentResult>;
}

// ---------------------------------------------------------------------------
// Subagent invocation protocol (Agent Team Migration)
// ---------------------------------------------------------------------------

/** Describes a single Subagent invocation's complete parameters. */
export interface SubagentInvocation {
  /** Subagent role identifier, corresponding to .claude/agents/ definitions. */
  agentType: string;
  /** Task instructions for the subagent. */
  prompt: string;
  /** Permission mode for the subagent. */
  permissionMode: "default" | "acceptEdits";
  /** Maximum number of turns. */
  maxTurns: number;
}

/** Subagent execution result. */
export interface SubagentResult {
  /** Subagent role identifier. */
  agentType: string;
  /** Execution status. */
  status: "success" | "failure" | "timeout";
  /** Structured output (on success). */
  output?: string;
  /** Error message (on failure/timeout). */
  error?: string;
}

/** Parallel execution aggregate result. */
export interface ParallelExecutionResult<T = string> {
  /** Successfully completed subagent results. */
  succeeded: Array<{ agentType: string; result: T }>;
  /** Failed subagent records. */
  failed: Array<{ agentType: string; error: string }>;
}
