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
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** Number of consecutive hypothesis rejections before escalating. */
export const HYPOTHESIS_ESCALATION_THRESHOLD = 3;
/** The four debug phases in order. */
export const DEBUG_PHASES = ["collect", "pattern", "hypothesize", "fix"];
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
export function validateHypothesis(hypothesis) {
    const errors = [];
    if (!hypothesis.description || hypothesis.description.trim().length === 0) {
        errors.push("假设描述不能为空");
    }
    if (!hypothesis.verifyCommand || hypothesis.verifyCommand.trim().length === 0) {
        errors.push("验证命令不能为空");
    }
    if (!hypothesis.expectedOutcome || hypothesis.expectedOutcome.trim().length === 0) {
        errors.push("预期结果不能为空");
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
export function analyzeHypothesisResults(sequence) {
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
        }
        else {
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
export function shouldQuestionArchitecture(sequence) {
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
export function isValidPhaseTransition(from, to) {
    const fromIndex = DEBUG_PHASES.indexOf(from);
    const toIndex = DEBUG_PHASES.indexOf(to);
    return toIndex === fromIndex + 1;
}
/**
 * Get the next debug phase.
 *
 * Returns null if the current phase is the last one (fix).
 */
export function getNextPhase(current) {
    const index = DEBUG_PHASES.indexOf(current);
    if (index === -1 || index >= DEBUG_PHASES.length - 1) {
        return null;
    }
    return DEBUG_PHASES[index + 1];
}
//# sourceMappingURL=debug.js.map