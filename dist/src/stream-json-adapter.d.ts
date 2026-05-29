import type { Readable, Writable } from "node:stream";
import type { TokenUsage } from "./loop-types.js";
import type { RateLimitDegrader } from "./rate-limit-degrader.js";
export declare class BackpressureUnrelievedError extends Error {
    readonly elapsedMs: number;
    constructor(elapsedMs: number);
}
export declare class LineTooLargeError extends Error {
    readonly lineLength: number;
    constructor(lineLength: number);
}
export interface AdapterResult {
    delivered: Array<Record<string, unknown>>;
    usage: TokenUsage;
    costUsd: number;
    lastEventType: string | null;
}
export interface StreamJsonAdapterOptions {
    degrader?: RateLimitDegrader;
}
export declare class StreamJsonAdapter {
    private runDir;
    private degrader?;
    constructor(runDir: string, options?: StreamJsonAdapterOptions);
    consume(stdout: Readable, stdin?: Writable & {
        pause?(): void;
        resume?(): void;
    }): Promise<AdapterResult>;
    private extractMessageId;
    private bufferPartial;
    private mergeBuffer;
    private logParseError;
    private logApiError;
    private logUnknownEvent;
    private logDedup;
}
