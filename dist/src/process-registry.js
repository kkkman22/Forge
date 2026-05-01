import { execFileSync, spawn } from "node:child_process";
export class ProcessRegistry {
    static instance = null;
    processes = new Map();
    sessionStartTime = Date.now();
    constructor() { }
    static getInstance() {
        if (!ProcessRegistry.instance) {
            ProcessRegistry.instance = new ProcessRegistry();
        }
        return ProcessRegistry.instance;
    }
    static resetInstance() {
        ProcessRegistry.instance = null;
    }
    register(child, metadata) {
        const entry = {
            pid: child.pid,
            pgid: child.pid,
            startTime: Date.now(),
            ...metadata,
        };
        this.processes.set(entry.pid, entry);
        child.on("exit", () => {
            this.unregister(entry.pid);
        });
    }
    unregister(pid) {
        this.processes.delete(pid);
    }
    getAll() {
        return Array.from(this.processes.values());
    }
    size() {
        return this.processes.size;
    }
    spawnTracked(command, args, options) {
        const { source, description, ...spawnOpts } = options;
        const detached = spawnOpts.detached ?? false;
        const child = spawn(command, args, spawnOpts);
        this.register(child, { source, detached, description });
        return child;
    }
    execTracked(command, args, options) {
        const { source, timeout, ...execOpts } = options ?? {};
        return execFileSync(command, args, {
            ...execOpts,
            timeout: timeout ?? 30_000,
            killSignal: "SIGTERM",
        });
    }
    async shutdownAll(timeoutMs = 5000) {
        const result = {
            terminated: 0,
            forcedKill: 0,
            alreadyExited: 0,
            errors: [],
        };
        const entries = Array.from(this.processes.values());
        const pending = new Map();
        for (const meta of entries) {
            pending.set(meta.pid, { meta, exited: false });
            try {
                if (meta.detached) {
                    process.kill(-meta.pgid, "SIGTERM");
                }
                else {
                    process.kill(meta.pid, "SIGTERM");
                }
            }
            catch (err) {
                if (err.code === "ESRCH") {
                    result.alreadyExited++;
                    pending.delete(meta.pid);
                }
                else {
                    result.errors.push({ pid: meta.pid, error: err.message });
                }
            }
        }
        if (pending.size > 0) {
            await new Promise((resolve) => {
                const timer = setTimeout(() => {
                    for (const [pid, state] of pending) {
                        if (!state.exited) {
                            try {
                                if (state.meta.detached) {
                                    process.kill(-state.meta.pgid, "SIGKILL");
                                }
                                else {
                                    process.kill(pid, "SIGKILL");
                                }
                                result.forcedKill++;
                            }
                            catch (err) {
                                if (err.code === "ESRCH") {
                                    result.alreadyExited++;
                                }
                                else {
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
                            }
                            catch {
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
        console.info(`ProcessRegistry shutdown: terminated=${result.terminated} forcedKill=${result.forcedKill} alreadyExited=${result.alreadyExited} errors=${result.errors.length}`);
        return result;
    }
    serialize() {
        return JSON.stringify({
            sessionPid: process.pid,
            sessionPgid: process.pid,
            sessionStartTime: this.sessionStartTime,
            processes: Array.from(this.processes.values()),
        });
    }
    static deserialize(json) {
        let parsed;
        try {
            parsed = JSON.parse(json);
        }
        catch {
            throw new Error(`Invalid JSON in ProcessRegistry deserialize: ${json.slice(0, 50)}`);
        }
        if (typeof parsed.sessionPid !== "number" ||
            typeof parsed.sessionPgid !== "number" ||
            typeof parsed.sessionStartTime !== "number" ||
            !Array.isArray(parsed.processes)) {
            throw new Error("Missing required fields in ProcessRegistry deserialize (sessionPid, sessionPgid, sessionStartTime, processes)");
        }
        return parsed;
    }
}
//# sourceMappingURL=process-registry.js.map