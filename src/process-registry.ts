import { spawn, execFileSync } from "node:child_process";
import type { ChildProcess, SpawnOptions, ExecFileSyncOptions } from "node:child_process";

export interface ProcessMetadata {
	pid: number;
	pgid: number;
	startTime: number;
	source: string;
	detached: boolean;
	description?: string;
}

export interface SerializedRegistry {
	sessionPid: number;
	sessionPgid: number;
	sessionStartTime: number;
	processes: ProcessMetadata[];
}

export interface ShutdownResult {
	terminated: number;
	forcedKill: number;
	alreadyExited: number;
	errors: Array<{ pid: number; error: string }>;
}

export class ProcessRegistry {
	private static instance: ProcessRegistry | null = null;
	private processes = new Map<number, ProcessMetadata>();

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
			pid: child.pid!,
			pgid: child.pid!,
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
			} catch (err: any) {
				if (err.code === "ESRCH") {
					result.alreadyExited++;
					pending.delete(meta.pid);
				} else {
					result.errors.push({ pid: meta.pid, error: err.message });
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
							} catch (err: any) {
								if (err.code === "ESRCH") {
									result.alreadyExited++;
								} else {
									result.errors.push({ pid, error: err.message });
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
							} catch {
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
		return result;
	}
}
