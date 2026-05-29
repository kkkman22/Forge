export declare const IPC_SCHEMA_VERSION = 1;
export declare const SUPPORTED_EVENTS: readonly ["forge_loop_run_started", "iteration_start", "iteration_end", "progress", "message", "tool_use", "tool_result", "completion", "run_completed", "error", "warning", "version"];
export interface IpcFrame {
    event: string;
    run_id: string;
    schema: number;
    ts: string;
    [key: string]: unknown;
}
export declare class IpcEmitter {
    private runId;
    constructor(runId: string);
    emitVersion(): void;
    emit(frame: Partial<IpcFrame> & {
        event: string;
    }): void;
    emitError(opts: {
        code: string;
        message: string;
        fatal: boolean;
        retryable: boolean;
    }): void;
    emitWarning(opts: {
        code: string;
        attempt?: number;
    }): void;
}
