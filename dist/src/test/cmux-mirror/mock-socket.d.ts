interface JsonRpcRequest {
    jsonrpc: "2.0";
    id?: number;
    method: string;
    params?: Record<string, unknown>;
}
interface MockSocketOptions {
    /** Custom socket path. If omitted, a temp path is generated. */
    socketPath?: string;
}
export interface MockSocketResult {
    socketPath: string;
    requests: JsonRpcRequest[];
    close: () => Promise<void>;
}
/**
 * Creates a mock cmux Unix socket server that records JSON-RPC requests.
 * Responds to supported methods with canned responses.
 */
export declare function createMockSocket(opts?: MockSocketOptions): Promise<MockSocketResult>;
export {};
