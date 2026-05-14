export interface DevServerHandle {
    terminalId: string;
    port: number;
    projectRoot: string;
}
export interface DevServerLifecycle {
    start(projectRoot: string, port?: number): Promise<DevServerHandle>;
    stop(handle: DevServerHandle): Promise<void>;
}
export declare function buildStartCommand(port: number): string;
export declare function parseTerminalId(output: string): string | null;
export declare function isTimeoutElapsed(startTime: number, timeoutMs?: number): boolean;
export declare function withDevServer<T>(startFn: () => Promise<DevServerHandle>, stopFn: (handle: DevServerHandle) => Promise<void>, workFn: (handle: DevServerHandle) => Promise<T>): Promise<T>;
