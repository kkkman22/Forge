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
 */
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
    /** Description of the hypothesis. */
    description: string;
    /** Command to verify this hypothesis. */
    verifyCommand: string;
    /** What we expect to see if the hypothesis is correct. */
    expectedOutcome: string;
}
export interface HypothesisValidation {
    valid: boolean;
    errors: string[];
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
/** Number of consecutive hypothesis rejections before escalating. */
export declare const HYPOTHESIS_ESCALATION_THRESHOLD = 3;
/** The four debug phases in order. */
export declare const DEBUG_PHASES: DebugPhase[];
/**
 * Validate that a hypothesis has all required fields.
 *
 * Per SKILL.md, every hypothesis must have:
 *   - description: non-empty
 *   - verifyCommand: non-empty
 *   - expectedOutcome: non-empty
 */
export declare function validateHypothesis(hypothesis: Hypothesis): HypothesisValidation;
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
export declare function analyzeHypothesisResults(sequence: HypothesisSequence): DebugEscalationResult;
/**
 * Convenience function: should we escalate to architecture review?
 */
export declare function shouldQuestionArchitecture(sequence: HypothesisSequence): boolean;
/**
 * Validate that a debug phase transition is valid.
 *
 * Phases must proceed in order: collect → pattern → hypothesize → fix.
 * Skipping phases is not allowed.
 */
export declare function isValidPhaseTransition(from: DebugPhase, to: DebugPhase): boolean;
/**
 * Get the next debug phase.
 *
 * Returns null if the current phase is the last one (fix).
 */
export declare function getNextPhase(current: DebugPhase): DebugPhase | null;
