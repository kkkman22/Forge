export interface DevServerHandle {
  terminalId: string;
  port: number;
  projectRoot: string;
}

export interface DevServerLifecycle {
  start(projectRoot: string, port?: number): Promise<DevServerHandle>;
  stop(handle: DevServerHandle): Promise<void>;
}

// biome-ignore lint/correctness/noUnusedVariables: used by consumers
const DEFAULT_PORT = 5173;
const TIMEOUT_MS = 5 * 60 * 1000;

export function buildStartCommand(port: number): string {
  return `npm run dev -- --port ${port}`;
}

export function parseTerminalId(output: string): string | null {
  const match = output.match(/terminal_id[=:]\s*(\S+)/);
  return match ? match[1] : null;
}

export function isTimeoutElapsed(startTime: number, timeoutMs = TIMEOUT_MS): boolean {
  return Date.now() - startTime >= timeoutMs;
}

export async function withDevServer<T>(
  startFn: () => Promise<DevServerHandle>,
  stopFn: (handle: DevServerHandle) => Promise<void>,
  workFn: (handle: DevServerHandle) => Promise<T>,
): Promise<T> {
  const handle = await startFn();
  const startTime = Date.now();
  try {
    if (isTimeoutElapsed(startTime)) {
      throw new Error("Dev server startup exceeded 5-minute timeout");
    }
    return await workFn(handle);
  } finally {
    await stopFn(handle);
  }
}
