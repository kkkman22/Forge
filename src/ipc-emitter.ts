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
] as const;

export interface IpcFrame {
  event: string;
  run_id: string;
  schema: number;
  ts: string;
  [key: string]: unknown;
}

export class IpcEmitter {
  private runId: string;

  constructor(runId: string) {
    this.runId = runId;
  }

  emitVersion(): void {
    this.emit({
      event: "version",
      schema: IPC_SCHEMA_VERSION,
      supported_events: [...SUPPORTED_EVENTS],
    });
  }

  emit(frame: Partial<IpcFrame> & { event: string }): void {
    const full: IpcFrame = {
      run_id: this.runId,
      schema: IPC_SCHEMA_VERSION,
      ts: new Date().toISOString(),
      ...frame,
    };
    const line = JSON.stringify(full);
    const truncated = `${line.slice(0, 1024)}\n`;
    process.stdout.write(truncated);
  }

  emitError(opts: { code: string; message: string; fatal: boolean; retryable: boolean }): void {
    this.emit({
      event: "error",
      code: opts.code,
      message: opts.message,
      fatal: opts.fatal,
      retryable: opts.retryable,
    });
  }

  emitWarning(opts: { code: string; attempt?: number }): void {
    this.emit({
      event: "warning",
      fatal: false,
      retryable: false,
      ...opts,
    });
  }
}
