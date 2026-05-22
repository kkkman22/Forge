/**
 * Mirror_Push_Socket: Unix socket server for receiving NDJSON events.
 * Rate-limited, tolerates malformed lines (R17).
 */
/**
 * Create a push socket server.
 * @param {Object} opts
 * @param {string} opts.socketPath - Unix socket path.
 * @param {(event: object) => void} opts.dispatch - Event handler.
 * @param {number} [opts.maxPerSecond=20] - Rate limit.
 */
export function createPushServer({ socketPath, dispatch, maxPerSecond }: {
    socketPath: string;
    dispatch: (event: object) => void;
    maxPerSecond?: number | undefined;
}): Promise<{
    readonly listening: boolean;
    close(): Promise<any>;
}>;
