import type { ChildProcess, ExecFileSyncOptions, SpawnOptions } from "node:child_process";
import { execFileSync, spawn } from "node:child_process";

/** @internal */
export interface ProcessMetadata {
  pid: number;
  pgid: number;
  startTime: number;
  source: string;
  detached: boolean;
  description?: string;
}

/** @internal */
export interface SerializedRegistry {
  sessionPid: number;
  sessionPgid: number;
  sessionStartTime: number;
  processes: ProcessMetadata[];
}

/** @internal */
export interface ShutdownResult {
  terminated: number;
  forcedKill: number;
  alreadyExited: number;
  errors: Array<{ pid: number; error: string }>;
}

/** @internal */
export class ProcessRegistry {
  private static instance: ProcessRegistry | null = null;
  private processes = new Map<number, ProcessMetadata>();
  private readonly sessionStartTime = Date.now();

  private constructor() {}

  static getInstance(): ProcessRegistry {
    if (!ProcessRegistry.instance) {
      ProcessRegistry.instance = new ProcessRegistry();
    }
    return ProcessRegistry.instance;
  }

  static resetInstance(): void {
    ProcessRegistry.instance = null;
  }

  register(
    child: ChildProcess,
    metadata: Omit<ProcessMetadata, "pid" | "pgid" | "startTime">,
  ): void {
    const entry: ProcessMetadata = {
      pid: child.pid ?? 0,
      pgid: child.pid ?? 0,
      startTime: Date.now(),
      ...metadata,
    };
    this.processes.set(entry.pid, entry);

    child.on("exit", () => {
      this.unregister(entry.pid);
    });
  }

  unregister(pid: number): void {
    this.processes.delete(pid);
  }

  getAll(): ReadonlyArray<ProcessMetadata> {
    return Array.from(this.processes.values());
  }

  size(): number {
    return this.processes.size;
  }

  spawnTracked(
    command: string,
    args: string[],
    options: SpawnOptions & { source: string; description?: string },
  ): ChildProcess {
    const { source, description, ...spawnOpts } = options;
    const detached = spawnOpts.detached ?? false;
    const child = spawn(command, args, spawnOpts);
    this.register(child, { source, detached, description });
    return child;
  }

  execTracked(
    command: string,
    args: string[],
    options?: ExecFileSyncOptions & { source?: string; timeout?: number },
  ): string | Buffer {
    const { source, timeout, ...execOpts } = options ?? {};
    return execFileSync(command, args, {
      ...execOpts,
      timeout: timeout ?? 30_000,
      killSignal: "SIGTERM",
    });
  }

  async shutdownAll(timeoutMs = 5000): Promise<ShutdownResult> {
    const result: ShutdownResult = {
      terminated: 0,
      forcedKill: 0,
      alreadyExited: 0,
      errors: [],
    };

    const entries = Array.from(this.processes.values());
    const pending = new Map<number, { meta: ProcessMetadata; exited: boolean }>();

    for (const meta of entries) {
      pending.set(meta.pid, { meta, exited: false });
      try {
        if (meta.detached) {
          process.kill(-meta.pgid, "SIGTERM");
        } else {
          process.kill(meta.pid, "SIGTERM");
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ESRCH") {
          result.alreadyExited++;
          pending.delete(meta.pid);
        } else {
          result.errors.push({ pid: meta.pid, error: (err as Error).message });
        }
      }
    }

    if (pending.size > 0) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          for (const [pid, state] of pending) {
            if (!state.exited) {
              try {
                if (state.meta.detached) {
                  process.kill(-state.meta.pgid, "SIGKILL");
                } else {
                  process.kill(pid, "SIGKILL");
                }
                result.forcedKill++;
              } catch (err) {
                if ((err as NodeJS.ErrnoException).code === "ESRCH") {
                  result.alreadyExited++;
                } else {
                  result.errors.push({ pid, error: (err as Error).message });
                }
              }
            }
          }
          resolve();
        }, timeoutMs);

        const poll = setInterval(() => {
          let allGone = true;
          for (const [pid, state] of pending) {
            if (!state.exited) {
              try {
                process.kill(pid, 0);
                allGone = false;
              } catch (err: unknown) {
                state.exited = true;
                result.terminated++;
              }
            }
          }
          if (allGone) {
            clearInterval(poll);
            clearTimeout(timer);
            resolve();
          }
        }, 50);
      });
    }

    this.processes.clear();
    // biome-ignore lint/suspicious/noConsole: shutdown diagnostic in standalone utility
    console.info(
      `ProcessRegistry shutdown: terminated=${result.terminated} forcedKill=${result.forcedKill} alreadyExited=${result.alreadyExited} errors=${result.errors.length}`,
    );
    return result;
  }

  serialize(): string {
    return JSON.stringify({
      sessionPid: process.pid,
      sessionPgid: process.pid,
      sessionStartTime: this.sessionStartTime,
      processes: Array.from(this.processes.values()),
    } satisfies SerializedRegistry);
  }

  static deserialize(json: string): SerializedRegistry {
    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    }       catch (_err: unknown) {
      throw new Error(`Invalid JSON in ProcessRegistry deserialize: ${json.slice(0, 50)}`);
    }

    const data = parsed as Record<string, unknown>;
    if (
      typeof data.sessionPid !== "number" ||
      typeof data.sessionPgid !== "number" ||
      typeof data.sessionStartTime !== "number" ||
      !Array.isArray(data.processes)
    ) {
      throw new Error(
        "Missing required fields in ProcessRegistry deserialize (sessionPid, sessionPgid, sessionStartTime, processes)",
      );
    }

    return data as unknown as SerializedRegistry;
  }
}
