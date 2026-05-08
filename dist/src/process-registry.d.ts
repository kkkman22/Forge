import type { ChildProcess, ExecFileSyncOptions, SpawnOptions } from "node:child_process";
/** @internal */
export interface ProcessMetadata {
    pid: number;
    pgid: number;
    startTime: number;
    source: string;
    detached: boolean;
    description?: string;
}
/** @internal */
export interface SerializedRegistry {
    sessionPid: number;
    sessionPgid: number;
    sessionStartTime: number;
    processes: ProcessMetadata[];
}
/** @internal */
export interface ShutdownResult {
    terminated: number;
    forcedKill: number;
    alreadyExited: number;
    errors: Array<{
        pid: number;
        error: string;
    }>;
}
/** @internal */
export declare class ProcessRegistry {
    private static instance;
    private processes;
    private readonly sessionStartTime;
    private constructor();
    static getInstance(): ProcessRegistry;
    static resetInstance(): void;
    register(child: ChildProcess, metadata: Omit<ProcessMetadata, "pid" | "pgid" | "startTime">): void;
    unregister(pid: number): void;
    getAll(): ReadonlyArray<ProcessMetadata>;
    size(): number;
    spawnTracked(command: string, args: string[], options: SpawnOptions & {
        source: string;
        description?: string;
    }): ChildProcess;
    execTracked(command: string, args: string[], options?: ExecFileSyncOptions & {
        source?: string;
        timeout?: number;
    }): string | Buffer;
    shutdownAll(timeoutMs?: number): Promise<ShutdownResult>;
    serialize(): string;
    static deserialize(json: string): SerializedRegistry;
}
