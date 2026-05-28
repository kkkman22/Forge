export type Subcommand = "review" | "decide" | "learn";
export type DispatchMode = "interactive" | "loop";
export type ChosenLevel = "L0" | "L1" | "L2" | "L3";
export type L1TriggerReason = "gate_disabled" | "env_unset" | "non_interactive" | "workflow_missing" | "workflow_syntax_error" | "concurrency_uncontrolled" | "unmatched_state";
export type L0FailureSignature = "bp_exception" | "schema_validation_failed" | "subprocess_crash" | "stuck_timeout" | "frozen_zone_blocked";
export interface DispatchContext {
    subcommand: Subcommand;
    runId: string;
    sessionId: string;
    mode: DispatchMode;
    forgeRoot: string;
    pluginRoot: string;
}
export interface DispatchRecord {
    subcommand: string;
    mode: DispatchMode;
    run_id: string;
    session_id: string;
    workflow_state_id: string;
    workflow_version: string;
    gate_enabled: boolean;
    workflow_available: boolean;
    chosen_level: ChosenLevel;
    l1_trigger_reason?: string;
    l0_failure_signature?: string;
    exit_code: number;
    duration_ms: number;
    timestamp: string;
    frozen_zone_blocked: boolean;
}
export interface DispatchResult {
    chosenLevel: ChosenLevel;
    l1TriggerReason?: L1TriggerReason;
    l0FailureSignature?: L0FailureSignature;
    methodology?: string;
    result?: string;
    payload?: unknown;
}
export interface FallbackResult {
    output?: string;
    methodology?: string;
    precursor_partial?: string;
}
export interface AuditWriterLike {
    write(target: {
        subcommand: string;
        runId: string;
        topic: string;
        payload: unknown;
    }): Promise<void>;
}
export interface DispatchDeps {
    tryL0?: (ctx: DispatchContext) => Promise<unknown>;
    runFallback?: (ctx: DispatchContext, extras?: {
        precursorPartial?: string;
    }) => Promise<FallbackResult | null>;
    allFallbacksFailed?: boolean;
    auditWriter?: AuditWriterLike;
    topic?: string;
}
export interface ProbeResult {
    eligible: boolean;
    reason?: L1TriggerReason;
}
export declare function probeL0Eligibility(ctx: DispatchContext): ProbeResult;
export declare function classifyL0Failure(err: Error): L0FailureSignature;
export declare function readWorkflowVersion(ctx: DispatchContext): string;
export declare function computeExitCode(result: DispatchResult): number;
export declare function dispatch(ctx: DispatchContext, deps?: DispatchDeps): Promise<DispatchResult & {
    record: DispatchRecord;
}>;
export declare function writeDispatchRecord(runDir: string, record: DispatchRecord): void;
export declare function updateStatusMd(statusPath: string, fields: {
    dispatch_chosen_level: string;
    dispatch_subcommand: string;
    dispatch_run_id: string;
    phase?: string;
}): void;
export declare function isolatePartialFindings(runDir: string, subcommand: string, content: string): string;
export declare function writeBlockedAuditRecord(forgeRoot: string, subcommand: Subcommand, topic: string, runId: string): string;
