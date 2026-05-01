export interface PidFileContent {
    sessionPid: number;
    sessionPgid: number;
    sessionStartTime: number;
    processes: Array<{
        pid: number;
        source: string;
    }>;
}
export interface OrphanProcess {
    pid: number;
    command: string;
    elapsedSeconds: number;
    source: "pid-file" | "ppid-detection";
}
export declare function writePidFile(sessionId: string, content: PidFileContent, baseDir: string): void;
export declare function readPidFile(filePath: string): PidFileContent | null;
export declare function deletePidFile(sessionId: string, baseDir: string): void;
export declare function cleanupStaleSessions(baseDir: string): Promise<OrphanProcess[]>;
export declare function detectPpidOrphans(patterns: string[], maxAgeSeconds: number): Promise<OrphanProcess[]>;
export declare function cleanupOrphans(orphans: OrphanProcess[], autoKillThresholdSeconds: number): {
    killed: number[];
    warned: number[];
};
