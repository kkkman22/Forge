import type { GateBlockReason } from "./cmux-gate.js";
export type { GateBlockReason } from "./cmux-gate.js";
export interface AuditEntry {
    ts: string;
    sub: string;
    topic_hash: string;
    lib_hash: string;
    tools_granted: string[];
    dispatch_mode: string;
    outcome: "success" | "failure" | "rejected";
    prev_hmac: string;
    hmac: string;
    gate_result: "go" | "n_a" | "blocked";
    cmux_available: boolean | null;
    gate_reason: GateBlockReason | null;
}
export interface AuditOpts {
    auditDir?: string;
}
export declare function computeHmac(prevHmac: string, entry: Omit<AuditEntry, "hmac">): string;
export declare function appendAuditLog(entry: AuditEntry, opts?: AuditOpts): Promise<void>;
