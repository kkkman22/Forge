import type { ResolveMode, ResolveResult } from "./conflict-resolver.js";
export interface BuildGitHookOptions {
    cwd: string;
    simulateOutput?: string;
    mode?: ResolveMode;
    statusContent?: string;
    readFileContent: (path: string) => Promise<string>;
    writeFileContent: (path: string, content: string) => Promise<void>;
}
export interface BuildGitHookResult {
    status: "success" | "conflict" | "frozen-refused" | "escalate-debug";
    conflictResult?: ResolveResult;
}
export declare const buildGitHook: {
    runWithConflictHandling(_operation: "rebase" | "pull" | "merge", options: BuildGitHookOptions): Promise<BuildGitHookResult>;
};
