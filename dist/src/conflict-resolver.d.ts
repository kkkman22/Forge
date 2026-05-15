export type Zone = "frozen" | "guarded" | "open" | "source";
export declare function classifyConflictZone(path: string, _statusContent: string): Zone;
export type GuardedFileType = "progress" | "known-failures" | "reviews" | "adr";
export interface MergeResult {
    merged: string;
    conflicts: string[];
}
export declare function applyGuardedMerge(type: GuardedFileType, ours: string, theirs: string): MergeResult;
export declare function buildFrozenRefusalPrompt(paths: string[]): string;
export interface ValidationGate {
    passed: boolean;
    attemptCount: number;
    escalateToDebug: boolean;
}
export interface CheckAttempt {
    timestamp: number;
    filesSinceLastAttempt: Set<string>;
    exitCode: number;
}
export declare function validateConflictResolution(attempts: CheckAttempt[]): ValidationGate;
export type ResolveMode = "autonomous" | "interactive";
export interface ResolveResult {
    allResolved: boolean;
    frozenRefused: boolean;
    escalateToDebug: boolean;
    resolvedPaths: string[];
    refusedPaths: string[];
    validationGate: ValidationGate;
}
interface ResolveContext {
    statusContent: string;
    repoRoot: string;
    readFileContent: (path: string) => Promise<string>;
    writeFileContent: (path: string, content: string) => Promise<void>;
    runCheckCommand?: () => Promise<{
        exitCode: number;
        changedFiles: Set<string>;
    }>;
}
export declare function resolveConflicts(paths: string[], _mode: ResolveMode, context: ResolveContext): Promise<ResolveResult>;
export interface HandleMergeConflictResult {
    handled: boolean;
    resolvedPaths: string[];
    refusedPaths: string[];
    shouldAbort: boolean;
    shouldEscalateDebug: boolean;
}
export declare function handleMergeConflict(mergeError: string, mode: ResolveMode, context: Omit<ResolveContext, "repoRoot"> & {
    repoRoot: string;
}): Promise<HandleMergeConflictResult>;
export declare function parseConflictedPaths(gitOutput: string): string[];
export {};
