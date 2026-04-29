/**
 * Context budget management — data models, classification mapping,
 * serializers and deserializers for context window consumption control.
 *
 * **Validates: Requirements 1.1–1.6, 2.1–2.5, 3.1–3.5, 4.1–4.5,
 * 5.1–5.5, 6.1–6.6, 8.1–8.4, 9.1–9.3, 10.1–10.5**
 */
export type InformationLifecycle = "persistent" | "phase-scoped" | "ephemeral" | "write-and-discard";
export interface ClassificationEntry {
    source: string;
    lifecycle: InformationLifecycle;
    trimmer: string | null;
}
export declare const CLASSIFICATION_MAP: ClassificationEntry[];
export declare function classifySource(source: string): InformationLifecycle | undefined;
export interface ExploreSummary {
    entryPoints: Array<{
        filePath: string;
        line: number;
        functionName: string;
    }>;
    dependencyChain: string[];
    relatedTests: Array<{
        filePath: string;
        testCount: number;
    }>;
    keyInterfaces: Array<{
        name: string;
        filePath: string;
        line: number;
    }>;
    fileGroups: Array<{
        moduleName: string;
        fileCount: number;
    }>;
}
export declare function serializeExploreResult(input: ExploreSummary | string | null | undefined): string;
export declare function serializeExploreSummary(summary: ExploreSummary): string;
export declare function deserializeExploreSummary(text: string): ExploreSummary;
export interface ReviewSummary {
    filePath: string;
    severityCounts: {
        p0: number;
        p1: number;
        p2: number;
        p3: number;
    };
    findings: Array<{
        severity: "P0" | "P1" | "P2" | "P3";
        filePath: string;
        line: number;
        description: string;
    }>;
}
export declare function serializeReviewSummary(summary: ReviewSummary): string;
export declare function deserializeReviewSummary(text: string): ReviewSummary;
export interface TestOutputSummary {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    failures: Array<{
        testName: string;
        filePath: string;
        line: number;
        errorMessage: string;
    }>;
    parseFailed?: boolean;
}
export declare function serializeTestOutput(summary: TestOutputSummary): string;
export declare function canParseTestOutput(text: string): boolean;
export declare function deserializeTestOutput(text: string): TestOutputSummary;
export interface GitDiffSummary {
    fileCount: number;
    files: Array<{
        filePath: string;
        added: number;
        removed: number;
    }>;
    totalAdded: number;
    totalRemoved: number;
    fullDiffPath: string | null;
}
export interface GitStatusSummary {
    staged: {
        count: number;
        files: string[];
    };
    modified: {
        count: number;
        files: string[];
    };
    untracked: {
        count: number;
        files: string[];
    };
}
export declare function serializeGitDiff(summary: GitDiffSummary, lineCount: number): string;
export declare function deserializeGitDiff(text: string): GitDiffSummary;
export declare function serializeGitStatus(summary: GitStatusSummary, fileCount: number): string;
export declare function deserializeGitStatus(text: string): GitStatusSummary;
export interface SubagentSummary {
    status: "DONE" | "DONE_WITH_CONCERNS" | "NEEDS_CONTEXT" | "BLOCKED";
    taskDescription: string;
    changedFiles: string[];
    testResult: {
        passed: number;
        failed: number;
    };
    commitMessage: string;
    selfCheckResults: string;
    blockingReason?: string;
    concerns?: string[];
}
export declare function serializeSubagentSummary(summary: SubagentSummary): string;
export declare function deserializeSubagentSummary(text: string): SubagentSummary;
export interface ContextBudgetReport {
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
}
export declare function serializeContextBudgetReport(report: ContextBudgetReport): string;
export declare function deserializeContextBudgetReport(text: string): ContextBudgetReport;
