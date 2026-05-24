export interface RecapReport {
    window: string;
    since: string;
    until: string;
    categories: Record<string, RecapEntry[]>;
    staleRules: string[];
    totalCommits: number;
    totalSessions: number;
    totalTasks: number;
}
export interface RecapEntry {
    type: "commit" | "session" | "task";
    message: string;
    author?: string;
    date: string;
    category: string;
}
export interface RecapOptions {
    window?: string;
    forgeDir?: string;
}
export declare function runRecap(opts?: RecapOptions): RecapReport;
