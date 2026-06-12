/**
 * Debug engine — core logic extracted from forge-debug/SKILL.md.
 *
 * Implements the four-phase structured root cause analysis:
 *   Phase 1: Collect — gather error context
 *   Phase 2: Pattern — match against known patterns
 *   Phase 3: Hypothesize — form and test hypotheses
 *   Phase 4: Fix — apply targeted fix
 *
 * Key rules:
 *   - 3 consecutive hypothesis verification failures → stop fixing, question architecture
 *   - Each hypothesis must have a verification command and expected outcome
 *   - Fix attempts are tracked with the same escalation logic as build
 *
 * Property 21: Debug 假设验证升级
 *   - 3 consecutive hypothesis failures → escalate to architecture review
 *   - Success resets the counter
 *   **Validates: CLAUDE.md §2.4 second-level three-strikes**
 *
 * Property 22: Debug 假设完整性
 *   - Every hypothesis must have: description, verifyCommand, expectedOutcome
 *   - Incomplete hypotheses are rejected
 *
 * Property 22b: Debug 假设科学性 (Spec 5 gsd-core-adoption)
 *   - Strict mode requires falsificationTest + blindSpots
 *   - Non-strict mode (default) preserves backward compat with 3-field hypotheses
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ErrorContext {
  /** The error message or symptom. */
  errorMessage: string;
  /** File where the error occurred. */
  filePath: string;
  /** Line number (if known). */
  lineNumber: number | null;
  /** Stack trace (if available). */
  stackTrace: string;
  /** Recent changes that might be related. */
  recentChanges: string[];
}

export interface Hypothesis {
  description: string;
  verifyCommand: string;
  expectedOutcome: string;
  falsificationTest?: string;
  blindSpots?: string[];
}

export interface HypothesisValidation {
  valid: boolean;
  errors: string[];
}

export interface HypothesisValidationOptions {
  strict?: boolean;
}

export type HypothesisResult = "confirmed" | "rejected";

export interface HypothesisSequence {
  results: HypothesisResult[];
}

export interface DebugEscalationResult {
  /** Whether to stop fixing and question architecture. */
  shouldEscalate: boolean;
  /** Number of consecutive rejections at the point of check. */
  consecutiveRejections: number;
  /** Index where escalation is triggered (-1 if no escalation). */
  escalationIndex: number;
}

export type DebugPhase = "collect" | "pattern" | "hypothesize" | "fix";

export interface DebugSession {
  phase: DebugPhase;
  errorContext: ErrorContext;
  hypotheses: Hypothesis[];
  results: HypothesisResult[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Number of consecutive hypothesis rejections before escalating. */
export const HYPOTHESIS_ESCALATION_THRESHOLD = 3;

/** The four debug phases in order. */
export const DEBUG_PHASES: DebugPhase[] = ["collect", "pattern", "hypothesize", "fix"];

// ---------------------------------------------------------------------------
// Hypothesis validation (Property 22)
// ---------------------------------------------------------------------------

/**
 * Validate that a hypothesis has all required fields.
 *
 * Per SKILL.md, every hypothesis must have:
 *   - description: non-empty
 *   - verifyCommand: non-empty
 *   - expectedOutcome: non-empty
 */
export function validateHypothesis(
  hypothesis: Hypothesis,
  options?: HypothesisValidationOptions,
): HypothesisValidation {
  const errors: string[] = [];

  if (!hypothesis.description || hypothesis.description.trim().length === 0) {
    errors.push("假设描述不能为空");
  }

  if (!hypothesis.verifyCommand || hypothesis.verifyCommand.trim().length === 0) {
    errors.push("验证命令不能为空");
  }

  if (!hypothesis.expectedOutcome || hypothesis.expectedOutcome.trim().length === 0) {
    errors.push("预期结果不能为空");
  }

  if (options?.strict) {
    if (!hypothesis.falsificationTest || hypothesis.falsificationTest.trim().length === 0) {
      errors.push("证伪测试不能为空（strict 模式要求）");
    }
    if (!hypothesis.blindSpots || hypothesis.blindSpots.length === 0) {
      errors.push("盲点列表不能为空（strict 模式要求）");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Hypothesis escalation (Property 21)
// ---------------------------------------------------------------------------

/**
 * Analyze a sequence of hypothesis verification results.
 *
 * Per CLAUDE.md §2.4 (second-level three-strikes):
 *   - 3 consecutive rejections → stop fixing, question architecture
 *   - A confirmed hypothesis resets the counter
 *   - Fewer than 3 consecutive rejections → continue
 *
 * This is structurally identical to build's analyzeFixAttempts but operates
 * on hypothesis results instead of fix results.
 */
export function analyzeHypothesisResults(sequence: HypothesisSequence): DebugEscalationResult {
  let consecutiveRejections = 0;

  for (let i = 0; i < sequence.results.length; i++) {
    if (sequence.results[i] === "rejected") {
      consecutiveRejections++;
      if (consecutiveRejections >= HYPOTHESIS_ESCALATION_THRESHOLD) {
        return {
          shouldEscalate: true,
          consecutiveRejections,
          escalationIndex: i,
        };
      }
    } else {
      consecutiveRejections = 0;
    }
  }

  return {
    shouldEscalate: false,
    consecutiveRejections,
    escalationIndex: -1,
  };
}

/**
 * Convenience function: should we escalate to architecture review?
 */
export function shouldQuestionArchitecture(sequence: HypothesisSequence): boolean {
  return analyzeHypothesisResults(sequence).shouldEscalate;
}

// ---------------------------------------------------------------------------
// Debug phase validation
// ---------------------------------------------------------------------------

/**
 * Validate that a debug phase transition is valid.
 *
 * Phases must proceed in order: collect → pattern → hypothesize → fix.
 * Skipping phases is not allowed.
 */
export function isValidPhaseTransition(from: DebugPhase, to: DebugPhase): boolean {
  const fromIndex = DEBUG_PHASES.indexOf(from);
  const toIndex = DEBUG_PHASES.indexOf(to);
  return toIndex === fromIndex + 1;
}

/**
 * Get the next debug phase.
 *
 * Returns null if the current phase is the last one (fix).
 */
export function getNextPhase(current: DebugPhase): DebugPhase | null {
  const index = DEBUG_PHASES.indexOf(current);
  if (index === -1 || index >= DEBUG_PHASES.length - 1) {
    return null;
  }
  return DEBUG_PHASES[index + 1];
}

// ---------------------------------------------------------------------------
// Failure-sink driver helper
// ---------------------------------------------------------------------------

import type { FailureContext } from "./failure-sink.js";

export interface DebugResolvedInput {
  topic: string;
  tier: "light" | "standard" | "full";
  rootCause?: string;
}

export function buildDebugResolvedContext(input: DebugResolvedInput): FailureContext {
  return {
    skill: "forge-debug",
    topic: input.topic,
    tier: input.tier,
    trigger: "debug_resolved",
    situation: input.rootCause ? `调试完成，根因：${input.rootCause}` : "调试完成",
    rootCause: input.rootCause,
  };
}
