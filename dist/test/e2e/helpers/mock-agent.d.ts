/**
 * E2E helper — ScriptedAgent mock implementing AgentInterface.
 *
 * Supports success / failure / stop responses with configurable sequences.
 */
import type { AgentInterface, AgentResult, AgentRunOptions, TokenUsage } from "../../../src/loop-types.js";
export interface ScriptedResponse {
    kind: "success" | "failure" | "stop";
    summary?: string;
    keyChanges?: string[];
    keyLearnings?: string[];
    usage?: Partial<TokenUsage>;
    errorMessage?: string;
}
/**
 * Programmable agent mock for E2E tests.
 * Returns responses in sequence from the provided script, then repeats the last one.
 */
export declare class ScriptedAgent implements AgentInterface {
    private script;
    name: string;
    private callCount;
    constructor(script: ScriptedResponse[]);
    run(_prompt: string, _cwd: string, _options?: AgentRunOptions): Promise<AgentResult>;
    close(): Promise<void>;
    get invocationCount(): number;
}
