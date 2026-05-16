export interface ReviewIssue {
    severity: "P0" | "P1" | "P2" | "P3";
    file: string;
    line: number;
    message: string;
}
export interface KnownFailure {
    pattern_id: string;
    severity: "P0" | "P1";
    first_seen: string;
    last_seen: string;
    occurrence_count: number;
    signature: string;
    fix_required: string;
}
export interface AppendBlock {
    pattern_id: string;
    severity: "P0" | "P1";
    first_seen_commit: string;
    signature: string;
    fix_required: string;
}
export interface DiffSummary {
    files: string[];
    changedText: string;
}
export declare function generateAppendBlock(issue: ReviewIssue, commitSha: string): AppendBlock | null;
export declare function mergeKnownFailures(existing: KnownFailure[], newBlocks: AppendBlock[]): KnownFailure[];
export declare function serializeKnownFailures(failures: KnownFailure[]): string;
export declare function parseKnownFailures(content: string): KnownFailure[];
export declare function detectRecurrence(failures: KnownFailure[], diff: DiffSummary): string[];
