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
}
export interface AuditOpts {
    auditDir?: string;
}
export declare function computeHmac(prevHmac: string, entry: Omit<AuditEntry, "hmac">): string;
export declare function appendAuditLog(entry: AuditEntry, opts?: AuditOpts): Promise<void>;
