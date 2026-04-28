/**
 * Quality gate — pure functions for evaluating review, test, and ship gates.
 *
 * All functions are pure: they accept raw file content strings and return
 * structured results without side effects. Unparseable content returns
 * `status: "skipped"` with a reason (never throws).
 *
 * Design reference: loop-skills-fusion § quality-gate.ts
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6**
 */
/** Quality gate evaluation result. */
export interface GateResult {
    /** Whether the gate passed, is blocked, or was skipped due to parse failure. */
    status: "passed" | "blocked" | "skipped";
    /** Human-readable explanation of the result. */
    reason: string;
    /** Issue list (review gate only, when blocked). */
    issues?: Array<{
        severity: string;
        description: string;
    }>;
}
/**
 * Evaluate the Review quality gate.
 *
 * Parses the review report content (YAML frontmatter with `p0_count` and
 * `p1_count` fields). If either count is greater than 0, returns `blocked`
 * with the list of P0/P1 issues extracted from the body. If both are 0,
 * returns `passed`. If the content cannot be parsed, returns `skipped`.
 *
 * @param reviewContent - Raw review report content string.
 * @returns Gate evaluation result.
 */
export declare function evaluateReviewGate(reviewContent: string): GateResult;
/**
 * Evaluate the Test quality gate.
 *
 * Parses the test result content (YAML frontmatter with `failed` field or
 * `result` field). If there are failed tests (`failed > 0` or `result` is
 * not `"pass"`), returns `blocked`. If all pass, returns `passed`. If the
 * content cannot be parsed, returns `skipped`.
 *
 * @param testResultContent - Raw test result content string.
 * @returns Gate evaluation result.
 */
export declare function evaluateTestGate(testResultContent: string): GateResult;
/**
 * Evaluate the Ship quality gate (three-gate combination).
 *
 * Combines Review + Test + Progress gates. If any one returns `blocked`,
 * the ship gate returns `blocked`. If all return `passed`, returns `passed`.
 * Skipped sub-gates are treated as non-blocking (they don't cause a block
 * on their own, but they also don't count as passed).
 *
 * @param reviewContent - Raw review report content string.
 * @param testResultContent - Raw test result content string.
 * @param progressContent - Raw progress content string.
 * @returns Gate evaluation result.
 */
export declare function evaluateShipGate(reviewContent: string, testResultContent: string, progressContent: string): GateResult;
