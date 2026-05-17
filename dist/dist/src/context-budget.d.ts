/** @public */
export function classifySource(source: any): string | undefined;
/** @public */
export function serializeExploreResult(input: any): string;
/** @public */
export function serializeExploreSummary(summary: any): string;
/** @public */
export function deserializeExploreSummary(text: any): {
    entryPoints: never[];
    dependencyChain: never[];
    relatedTests: never[];
    keyInterfaces: never[];
    fileGroups: never[];
};
/** @public */
export function serializeReviewSummary(summary: any): string;
/** @public */
export function deserializeReviewSummary(text: any): {
    filePath: string;
    severityCounts: {
        p0: number;
        p1: number;
        p2: number;
        p3: number;
    };
    findings: never[];
};
/** @public */
export function serializeTestOutput(summary: any): string;
/** @public */
export function canParseTestOutput(text: any): boolean;
/** @public */
export function deserializeTestOutput(text: any): {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    failures: never[];
};
/** @public */
export function serializeGitDiff(summary: any, lineCount: any): string;
/** @public */
export function deserializeGitDiff(text: any): {
    fileCount: number;
    files: never[];
    totalAdded: number;
    totalRemoved: number;
    fullDiffPath: null;
};
/** @public */
export function serializeGitStatus(summary: any, fileCount: any): string;
/** @public */
export function deserializeGitStatus(text: any): {
    staged: {
        count: number;
        files: never[];
    };
    modified: {
        count: number;
        files: never[];
    };
    untracked: {
        count: number;
        files: never[];
    };
};
/** @public */
export function serializeSubagentSummary(summary: any): string;
/** @public */
export function deserializeSubagentSummary(text: any): {
    status: string;
    taskDescription: string;
    changedFiles: never[];
    testResult: {
        passed: number;
        failed: number;
    };
    commitMessage: string;
    selfCheckResults: string;
};
/** @public */
export function serializeContextBudgetReport(report: any): string;
/** @public */
export function deserializeContextBudgetReport(text: any): {
    date: string;
    topic: string;
    totalBeforeTokens: number;
    totalAfterTokens: number;
    savingsPercentage: number;
    breakdown: {
        explore: {
            before: number;
            after: number;
        };
        review: {
            before: number;
            after: number;
        };
        test: {
            before: number;
            after: number;
        };
        git: {
            before: number;
            after: number;
        };
        subagent: {
            before: number;
            after: number;
        };
    };
};
/**
 * Context budget management — data models, classification mapping,
 * serializers and deserializers for context window consumption control.
 *
 * **Validates: Requirements 1.1–1.6, 2.1–2.5, 3.1–3.5, 4.1–4.5,
 * 5.1–5.5, 6.1–6.6, 8.1–8.4, 9.1–9.3, 10.1–10.5**
 */
/** @public */
export const CLASSIFICATION_MAP: ({
    source: string;
    lifecycle: string;
    trimmer: null;
} | {
    source: string;
    lifecycle: string;
    trimmer: string;
})[];
