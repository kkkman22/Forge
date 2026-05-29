// ---------------------------------------------------------------------------
// IpcEmitter — stdout NDJSON IPC protocol for forge-loop consumers
// ---------------------------------------------------------------------------
export const IPC_SCHEMA_VERSION = 1;
export const SUPPORTED_EVENTS = [
    "forge_loop_run_started",
    "iteration_start",
    "iteration_end",
    "progress",
    "message",
    "tool_use",
    "tool_result",
    "completion",
    "run_completed",
    "error",
    "warning",
    "version",
];
export class IpcEmitter {
    runId;
    constructor(runId) {
        this.runId = runId;
    }
    emitVersion() {
        this.emit({
            event: "version",
            schema: IPC_SCHEMA_VERSION,
            supported_events: [...SUPPORTED_EVENTS],
        });
    }
    emit(frame) {
        const full = {
            run_id: this.runId,
            schema: IPC_SCHEMA_VERSION,
            ts: new Date().toISOString(),
            ...frame,
        };
        const line = JSON.stringify(full);
        const truncated = `${line.slice(0, 1024)}\n`;
        process.stdout.write(truncated);
    }
    emitError(opts) {
        this.emit({
            event: "error",
            code: opts.code,
            message: opts.message,
            fatal: opts.fatal,
            retryable: opts.retryable,
        });
    }
    emitWarning(opts) {
        this.emit({
            event: "warning",
            fatal: false,
            retryable: false,
            ...opts,
        });
    }
}
//# sourceMappingURL=ipc-emitter.js.map