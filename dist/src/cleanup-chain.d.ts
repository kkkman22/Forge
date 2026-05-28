import type { ChildProcess } from "node:child_process";
export interface CleanupContext {
    runId: string;
    runDir: string;
    child?: ChildProcess;
    pidFile?: string;
    worktreePath?: string;
    worktreeCleanupAction?: "remove" | "keep";
    sleepProcess?: ChildProcess;
    lockFile?: string;
}
export declare function runCleanupChain(ctx: CleanupContext): Promise<void>;
