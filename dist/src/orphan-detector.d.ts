/** @internal */
export interface PidFileContent {
    sessionPid: number;
    sessionPgid: number;
    sessionStartTime: number;
    processes: Array<{
        pid: number;
        source: string;
    }>;
}
/** @internal */
export interface OrphanProcess {
    pid: number;
    command: string;
    elapsedSeconds: number;
    source: "pid-file" | "ppid-detection";
}
/** @internal */
export declare function writePidFile(sessionId: string, content: PidFileContent, baseDir: string): void;
/** @internal */
export declare function readPidFile(filePath: string): PidFileContent | null;
/** @internal */
export declare function deletePidFile(sessionId: string, baseDir: string): void;
/**
 * Count the number of active Forge loop sessions by scanning PID files.
 * A session is considered active if its `sessionPid` process is still alive.
 * Stale PID files (dead process) are cleaned up during the scan.
 * @internal
 */
export declare function countActiveSessions(baseDir: string): number;
/** @internal */
export declare function cleanupStaleSessions(baseDir: string): Promise<OrphanProcess[]>;
/** @internal */
export declare function detectPpidOrphans(patterns: string[], maxAgeSeconds: number): Promise<OrphanProcess[]>;
/** @internal */
export declare function cleanupOrphans(orphans: OrphanProcess[], autoKillThresholdSeconds: number): {
    killed: number[];
    warned: number[];
};
