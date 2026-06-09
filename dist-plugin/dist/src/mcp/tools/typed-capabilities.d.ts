import { z } from "zod";
export declare const TYPED_CAPABILITY_TOOL_NAMES: readonly ["forge_check_command", "forge_diff_summary", "forge_dist_sync", "forge_docs_drift", "forge_artifact_query", "forge_review_context"];
export type TypedCapabilityToolName = (typeof TYPED_CAPABILITY_TOOL_NAMES)[number];
export type TypedCapabilityConsumer = "doctor" | "status" | "review" | "ship";
export declare function validateTypedCapabilityOutput(toolName: TypedCapabilityToolName, value: unknown): z.ZodSafeParseSuccess<{
    schema_version: 1;
    status: "pass" | "fail";
    command: string;
    exit_code: number;
    stdout_tail: string;
    stderr_tail: string;
}> | z.ZodSafeParseError<{
    schema_version: 1;
    status: "pass" | "fail";
    command: string;
    exit_code: number;
    stdout_tail: string;
    stderr_tail: string;
}> | z.ZodSafeParseSuccess<{
    schema_version: 1;
    status: "unknown" | "pass" | "fail";
    summary?: {
        staged: {
            count: number;
            files: string[];
        };
        modified: {
            count: number;
            files: string[];
        };
        untracked: {
            count: number;
            files: string[];
        };
    } | undefined;
    error?: string | undefined;
}> | z.ZodSafeParseError<{
    schema_version: 1;
    status: "unknown" | "pass" | "fail";
    summary?: {
        staged: {
            count: number;
            files: string[];
        };
        modified: {
            count: number;
            files: string[];
        };
        untracked: {
            count: number;
            files: string[];
        };
    } | undefined;
    error?: string | undefined;
}> | z.ZodSafeParseSuccess<{
    schema_version: 1;
    status: "unknown" | "warn" | "pass" | "fail";
    summary?: {
        fileCount: number;
        files: {
            filePath: string;
            added: number;
            removed: number;
        }[];
        totalAdded: number;
        totalRemoved: number;
        fullDiffPath: string | null;
    } | undefined;
    error?: string | undefined;
}> | z.ZodSafeParseError<{
    schema_version: 1;
    status: "unknown" | "warn" | "pass" | "fail";
    summary?: {
        fileCount: number;
        files: {
            filePath: string;
            added: number;
            removed: number;
        }[];
        totalAdded: number;
        totalRemoved: number;
        fullDiffPath: string | null;
    } | undefined;
    error?: string | undefined;
}> | z.ZodSafeParseSuccess<{
    schema_version: 1;
    artifacts: {
        schema_version: 1;
        artifact_id: string;
        kind: "review" | "test" | "ship_gate" | "verify" | "mutation" | "docs_check" | "dist_sync";
        topic: string;
        run_id: string;
        trace_id: string;
        commit: string;
        command: string;
        exit_code: number;
        input_hash: string;
        result: "warn" | "blocked" | "pass" | "fail" | "inconclusive";
        producer: string;
        created_at: string;
        stdout_tail?: string | undefined;
        stderr_tail?: string | undefined;
        supersedes?: string | undefined;
    }[];
}> | z.ZodSafeParseError<{
    schema_version: 1;
    artifacts: {
        schema_version: 1;
        artifact_id: string;
        kind: "review" | "test" | "ship_gate" | "verify" | "mutation" | "docs_check" | "dist_sync";
        topic: string;
        run_id: string;
        trace_id: string;
        commit: string;
        command: string;
        exit_code: number;
        input_hash: string;
        result: "warn" | "blocked" | "pass" | "fail" | "inconclusive";
        producer: string;
        created_at: string;
        stdout_tail?: string | undefined;
        stderr_tail?: string | undefined;
        supersedes?: string | undefined;
    }[];
}> | z.ZodSafeParseSuccess<{
    schema_version: 1;
    health: {
        task: {
            id: string;
            tier?: string | undefined;
            phase?: string | undefined;
        };
        policyProfile: "solo" | "team" | "enterprise";
        branch: {
            status: "unknown" | "warn" | "pass" | "fail";
            message: string;
            source?: string | undefined;
        };
        worktree: {
            status: "unknown" | "warn" | "pass" | "fail";
            message: string;
            source?: string | undefined;
        };
        spec: {
            status: "unknown" | "warn" | "pass" | "fail";
            message: string;
            source?: string | undefined;
        };
        plan: {
            status: "unknown" | "warn" | "pass" | "fail";
            message: string;
            source?: string | undefined;
        };
        progress: {
            status: "unknown" | "warn" | "pass" | "fail";
            message: string;
            total: number;
            completed: number;
            source?: string | undefined;
        };
        freshness: {
            review: {
                status: "unknown" | "warn" | "pass" | "fail";
                message: string;
                source?: string | undefined;
            };
            test: {
                status: "unknown" | "warn" | "pass" | "fail";
                message: string;
                source?: string | undefined;
            };
        };
        shipGate: {
            status: "unknown" | "warn" | "pass" | "fail";
            message: string;
            source?: string | undefined;
        };
        distSync: {
            status: "unknown" | "warn" | "pass" | "fail";
            message: string;
            source?: string | undefined;
        };
        docsDrift: {
            status: "unknown" | "warn" | "pass" | "fail";
            message: string;
            source?: string | undefined;
        };
        toolHealth: {
            status: "unknown" | "warn" | "pass" | "fail";
            message: string;
            source?: string | undefined;
        };
        gates: Record<string, {
            status: "unknown" | "warn" | "pass" | "fail";
            message: string;
            source?: string | undefined;
        }>;
        artifacts: Record<string, string>;
        nextStep: {
            phase: string | null;
            allowed: boolean;
            reasons: {
                code: "STATUS_UNKNOWN" | "NO_NEXT_PHASE" | "MISSING_ARTIFACT" | "STALE_ARTIFACT" | "FAILING_ARTIFACT";
                source: string;
                detail: string;
            }[];
            edge?: string | undefined;
        };
        generatedAt: string;
    };
    diff: {
        schema_version: 1;
        status: "unknown" | "warn" | "pass" | "fail";
        summary?: {
            fileCount: number;
            files: {
                filePath: string;
                added: number;
                removed: number;
            }[];
            totalAdded: number;
            totalRemoved: number;
            fullDiffPath: string | null;
        } | undefined;
        error?: string | undefined;
    };
}> | z.ZodSafeParseError<{
    schema_version: 1;
    health: {
        task: {
            id: string;
            tier?: string | undefined;
            phase?: string | undefined;
        };
        policyProfile: "solo" | "team" | "enterprise";
        branch: {
            status: "unknown" | "warn" | "pass" | "fail";
            message: string;
            source?: string | undefined;
        };
        worktree: {
            status: "unknown" | "warn" | "pass" | "fail";
            message: string;
            source?: string | undefined;
        };
        spec: {
            status: "unknown" | "warn" | "pass" | "fail";
            message: string;
            source?: string | undefined;
        };
        plan: {
            status: "unknown" | "warn" | "pass" | "fail";
            message: string;
            source?: string | undefined;
        };
        progress: {
            status: "unknown" | "warn" | "pass" | "fail";
            message: string;
            total: number;
            completed: number;
            source?: string | undefined;
        };
        freshness: {
            review: {
                status: "unknown" | "warn" | "pass" | "fail";
                message: string;
                source?: string | undefined;
            };
            test: {
                status: "unknown" | "warn" | "pass" | "fail";
                message: string;
                source?: string | undefined;
            };
        };
        shipGate: {
            status: "unknown" | "warn" | "pass" | "fail";
            message: string;
            source?: string | undefined;
        };
        distSync: {
            status: "unknown" | "warn" | "pass" | "fail";
            message: string;
            source?: string | undefined;
        };
        docsDrift: {
            status: "unknown" | "warn" | "pass" | "fail";
            message: string;
            source?: string | undefined;
        };
        toolHealth: {
            status: "unknown" | "warn" | "pass" | "fail";
            message: string;
            source?: string | undefined;
        };
        gates: Record<string, {
            status: "unknown" | "warn" | "pass" | "fail";
            message: string;
            source?: string | undefined;
        }>;
        artifacts: Record<string, string>;
        nextStep: {
            phase: string | null;
            allowed: boolean;
            reasons: {
                code: "STATUS_UNKNOWN" | "NO_NEXT_PHASE" | "MISSING_ARTIFACT" | "STALE_ARTIFACT" | "FAILING_ARTIFACT";
                source: string;
                detail: string;
            }[];
            edge?: string | undefined;
        };
        generatedAt: string;
    };
    diff: {
        schema_version: 1;
        status: "unknown" | "warn" | "pass" | "fail";
        summary?: {
            fileCount: number;
            files: {
                filePath: string;
                added: number;
                removed: number;
            }[];
            totalAdded: number;
            totalRemoved: number;
            fullDiffPath: string | null;
        } | undefined;
        error?: string | undefined;
    };
}>;
export declare function preferredTypedCapabilitiesForConsumer(consumer: TypedCapabilityConsumer): TypedCapabilityToolName[];
export interface ToolServer {
    registerTool: unknown;
}
export declare function registerTypedCapabilityTools(server: ToolServer, root?: {
    path: string;
}): void;
