import { type ChildProcess } from "node:child_process";
import { createLogEntry } from "./logger/index.js";
import type { AgentInterface, AgentResult, AgentRunOptions } from "./loop-types.js";
import type { RateLimitDegrader } from "./rate-limit-degrader.js";
export interface CliDriverConfig {
    cwd: string;
    runId: string;
    runDir: string;
    permissionMode: string;
    dangerouslySkipPermissions: boolean;
    allowedTools?: string[];
    disallowedTools?: string[];
    mcpConfig?: string;
    additionalDirs?: string[];
    systemPromptFile?: string;
    maxTurns: number;
    resumeSessionId?: string;
    sessionId?: string;
    logSink?: {
        log: (entry: ReturnType<typeof createLogEntry>) => void;
    };
    stuckTimeoutMs?: number;
    rateLimitDegrader?: RateLimitDegrader;
}
export interface BuildEnvOpts {
    maxParallelAgents: number;
    reviewConcurrency: number;
    runtimeConcurrency?: number;
}
export declare function buildArgs(config: CliDriverConfig): string[];
export declare function buildEnv(opts: BuildEnvOpts): NodeJS.ProcessEnv;
export declare class CliSubprocessDriver implements AgentInterface {
    readonly name = "claude-cli";
    private config;
    private adapter;
    child: ChildProcess | null;
    private runStartTime;
    constructor(config: CliDriverConfig);
    run(prompt: string, cwd: string, _options?: AgentRunOptions): Promise<AgentResult>;
    shutdown(_signal: NodeJS.Signals): Promise<void>;
    private recordSignalChain;
    private captureStderr;
}
