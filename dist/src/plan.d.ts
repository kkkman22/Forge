/**
 * Plan engine — core validation logic extracted from forge-plan/SKILL.md.
 *
 * Implements Plan task validation:
 *   - validateAtomicTask:  Validates a single atomic task has all required fields
 *   - scanForPlaceholders: Scans text for forbidden placeholder content
 *   - validatePlanTasks:   Validates all tasks in a plan
 *
 * Per SKILL.md §3, each atomic task must contain:
 *   - Task number, title, file path
 *   - TDD steps (RED/GREEN/REFACTOR)
 *   - Estimated time (2-5 minutes)
 *   - Verify command, commit message
 *   - No forbidden placeholders
 *
 * Per SKILL.md §4, forbidden placeholders:
 *   TBD, TODO, 待定, 后续补充, 类似 Task, 添加适当的错误处理
 */
export interface TDDSteps {
    red: {
        testFile: string;
        testCode: string;
        runCommand: string;
    };
    green: {
        sourceFile: string;
        sourceCode: string;
        runCommand: string;
    };
    refactor: string;
}
export interface AtomicTask {
    taskNumber: number;
    title: string;
    filePath: string;
    estimatedMinutes: number;
    tddSteps: TDDSteps;
    verifyCommand: string;
    commitMessage: string;
}
export declare const FORBIDDEN_PLACEHOLDERS: string[];
/**
 * Scan a text string for forbidden placeholder content.
 *
 * Per SKILL.md §4, the scan is case-insensitive and matches exact text
 * and common variants (e.g., `tbd`, `Todo`, `TODO:`, `// TODO`).
 *
 * Returns an array of found placeholder strings. Empty array means clean.
 */
export declare function scanForPlaceholders(text: string): string[];
/**
 * Validate a single atomic task.
 *
 * Checks:
 *   (a) All required fields are present and non-empty
 *   (b) Estimated time is between 2 and 5 minutes
 *   (c) No forbidden placeholders in any text field
 *   (d) Referenced types/functions consistency (checked at plan level)
 *
 * Returns { valid, errors } where errors lists all validation failures.
 */
export declare function validateAtomicTask(task: AtomicTask): {
    valid: boolean;
    errors: string[];
};
/**
 * Validate all tasks in a plan.
 *
 * Returns true only if every task passes validateAtomicTask.
 */
export declare function validatePlanTasks(tasks: AtomicTask[]): boolean;
