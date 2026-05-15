/**
 * SDK Driver Types — shared type definitions for the SDK driver and its
 * extracted sub-modules.
 *
 * This module contains only interfaces and type aliases — zero runtime logic.
 * It serves as the leaf node in the dependency DAG, allowing all extracted
 * modules to import types without circular dependencies.
 *
 * Design reference: sdk-driver-decomposition § design.md
 * **Validates: Requirements 1.1, 1.2, 10.1**
 */

import type { EffectExecutorInterface } from "./effect-executor.js";
import type { createLogSink, LogSinkConfig } from "./logger/index.js";
import type {
  AgentInterface,
  LoopConfig,
  NotesDocument,
  OrchestratorEffect,
  OrchestratorState,
  RunLimits,
} from "./loop-types.js";
import type { PerformanceTracker } from "./performance-tracker.js";
import type { TaskType } from "./pua-engine.js";
import type { PuaStateManager } from "./pua-state-manager.js";
import type { TranslateFn } from "./run-manager.js";
import type { StatusFileIO } from "./sdk-status-helpers.js";

// ---------------------------------------------------------------------------
// LogSink type alias
// ---------------------------------------------------------------------------

/**
 * Structured logger type — the return type of `createLogSink`.
 * Defined here to avoid coupling extracted modules to the concrete factory.
 * @public
 */
export type LogSink = ReturnType<typeof createLogSink>;

// ---------------------------------------------------------------------------
// Configuration and result types
// ---------------------------------------------------------------------------

/**
 * Configuration for the SDK driver instance.
 *
 * The `warmQuery` field is typed as `unknown` to avoid importing Agent SDK
 * types directly — the driver never touches it; it's passed through to the
 * agent adapter.
 * @public
 */
export interface SdkDriverConfig {
  /** The user-provided objective for the autonomous loop. */
  objective: string;
  /** Loop configuration (agent, failure thresholds, etc.). */
  loopConfig: LoopConfig;
  /** User-specified resource limits. */
  limits: RunLimits;
  /** Working directory (repository root). */
  cwd: string;
  /** Unique identifier for this run. */
  runId: string;
  /** Path to the run directory. */
  runDir: string;
  /** Pre-warmed Agent SDK query handle. */
  warmQuery: unknown;
  /** Base commit SHA for branch commit counting. */
  baseCommit: string;
  /** Path to the notes.md file for persistence. */
  notesPath: string;
  /** ★ Preset routing tier (from --tier). */
  presetTier?: string;
  /** ★ Preset task type (from --type). */
  presetTaskType?: string;
  /** ★ Preset project phase (from --phase). */
  presetProjectPhase?: string;
  /** ★ Preset work nature (from --nature). */
  presetWorkNature?: string;
  /** ★ Whether to enable Skill-aware mode. Defaults to false. */
  skillAware: boolean;
  /** Git branch name for this run (used to initialize notes metadata). */
  branchName: string;
  /** ★ Whether to enable PUA Quality Engine. Defaults to false. */
  puaEnabled?: boolean;
  /** ★ Preset task type for PUA methodology routing (from --pua-task-type). */
  puaTaskType?: TaskType;
  /** Optional callback to read StatusFile content (for skill-aware mode). */
  readStatusFile?: () => string;
  /** Optional callback to write StatusFile content (for skill-aware mode). */
  writeStatusFile?: (content: string) => void;
  /** Task name for parallel status tracking. When set, status file routing uses StatusManager. */
  taskName?: string;
  /** Optional callback to read review report content (for quality gate evaluation). */
  readReviewFile?: () => string;
  /** Optional callback to read test result content (for quality gate evaluation). */
  readTestFile?: () => string;
  /** Optional callback to read progress content (for quality gate evaluation). */
  readProgressFile?: () => string;
  /** Optional translation function for i18n support. When not provided, English strings are used. */
  t?: TranslateFn;
  /** Log sink configuration for structured logging. When not provided, defaults to text/info. */
  logSinkConfig?: LogSinkConfig;
  /** Whether to enable sandbox mode with fine-grained access control. */
  sandboxEnabled?: boolean;
  /** Whether SDK native sandbox is active (via SdkAgentAdapter). Skips .sandbox-active.json write. */
  sdkNativeSandbox?: boolean;
  /** Skip hooks protection validation and run without PreToolUse guards. */
  forceNoHooks?: boolean;
}

/**
 * Result returned when the driver loop exits.
 * @public
 */
export interface SdkDriverResult {
  /** The final orchestrator state at loop exit. */
  finalState: OrchestratorState;
  /** The accumulated notes document. */
  notesDocument: NotesDocument;
  /** Number of successful commits made during the run. */
  commitCount: number;
}

// ---------------------------------------------------------------------------
// Iteration context and result types
// ---------------------------------------------------------------------------

/**
 * Bundles all dependencies needed by extracted iteration functions.
 * Constructed by SdkDriver before each iteration call.
 * @public
 */
export interface IterationContext {
  // --- Configuration (read-only) ---
  readonly config: SdkDriverConfig;
  readonly limits: RunLimits;

  // --- Current state (read-only snapshot) ---
  readonly orchestratorState: OrchestratorState;
  readonly notesContent: string;
  readonly notesDocument: NotesDocument;

  // --- Injected collaborators ---
  readonly agentAdapter: AgentInterface;
  readonly effectExecutor: EffectExecutorInterface;
  readonly logger: LogSink;
  readonly perfTracker: PerformanceTracker;

  // --- Callbacks for I/O ---
  readonly executeEffects: (effects: OrchestratorEffect[]) => Promise<void>;
  readonly t: (key: string, params?: Record<string, string>) => string;

  // --- Optional abort signal (provided by SdkDriver for requestStop support) ---
  readonly abortSignal?: AbortSignal;

  // --- Optional PUA integration (generic iteration shares PUA state with skill-aware) ---
  readonly puaEnabled?: boolean;
  readonly puaStateManager?: PuaStateManager | null;
}

/**
 * Extended context for skill-aware iteration.
 * Adds PUA integration, status file I/O, and review-fix tracking.
 * @public
 */
export interface SkillIterationContext extends IterationContext {
  readonly statusFileIO: StatusFileIO | undefined;
  readonly puaStateManager: PuaStateManager | null;
  readonly puaEnabled: boolean;
  readonly reviewFixAttempts: number;
}

/**
 * Describes state changes that the caller (SdkDriver) should apply
 * after an extracted iteration function completes.
 * @public
 */
export interface IterationResult {
  /** Updated orchestrator state after all transitions. */
  orchestratorState: OrchestratorState;
  /** Updated notes document with the new entry appended. */
  notesDocument: NotesDocument;
  /** Updated notes content string. */
  notesContent: string;
  /** The last set of effects produced (for loop control). */
  lastEffects: OrchestratorEffect[];
  /** Updated review-fix attempt counter (skill-aware only). */
  reviewFixAttempts?: number;
  /** Whether the loop completed normally (skill-aware only). */
  loopCompletedNormally?: boolean;
}
