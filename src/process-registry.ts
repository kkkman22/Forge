import type { ChildProcess } from "node:child_process";

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
}
