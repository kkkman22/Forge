export type AuditSubcommand = "review" | "decide" | "learn";
export interface AuditWriteTarget {
    subcommand: AuditSubcommand;
    runId: string;
    topic: string;
    payload: Record<string, unknown>;
}
export declare class FrozenZoneViolation extends Error {
    readonly paths: string[];
    constructor(paths: string[]);
}
export declare class WorkflowAuditWriter {
    private forgeRoot;
    private frozenZoneChecker;
    private hookCheckPath?;
    constructor(forgeRoot: string, frozenZoneChecker: (path: string) => boolean, hookCheckPath?: string | undefined);
    write(target: AuditWriteTarget): Promise<void>;
    private resolveDestPath;
}
