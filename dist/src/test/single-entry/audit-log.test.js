import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendAuditLog } from "../../src/forge-dispatcher/audit-log.js";
const TMP_DIR = resolve(import.meta.dirname, "..", "__audit_tmp__");
describe("R2.7: audit log out of workspace", () => {
    beforeEach(() => {
        mkdirSync(TMP_DIR, { recursive: true });
    });
    afterEach(() => {
        rmSync(TMP_DIR, { recursive: true, force: true });
    });
    it("writes NDJSON to designated audit directory", async () => {
        await appendAuditLog({
            ts: "2026-05-17T00:00:00Z",
            sub: "build",
            topic_hash: "abc123",
            lib_hash: "def456",
            tools_granted: ["Read", "Bash"],
            dispatch_mode: "inline",
            outcome: "success",
            prev_hmac: "",
            hmac: "hmac1",
            gate_result: "n_a",
            cmux_available: null,
            gate_reason: null,
        }, { auditDir: TMP_DIR });
        const logFile = resolve(TMP_DIR, "dispatch.log");
        expect(existsSync(logFile)).toBe(true);
        const line = readFileSync(logFile, "utf-8").trim();
        const parsed = JSON.parse(line);
        expect(parsed.sub).toBe("build");
        expect(parsed.hmac).toBe("hmac1");
    });
    it("HMAC chain: second entry references first", async () => {
        const entry1 = {
            ts: "2026-05-17T00:00:00Z",
            sub: "build",
            topic_hash: "h1",
            lib_hash: "h2",
            tools_granted: ["Read"],
            dispatch_mode: "inline",
            outcome: "success",
            prev_hmac: "",
            hmac: "hmac1",
            gate_result: "n_a",
            cmux_available: null,
            gate_reason: null,
        };
        const entry2 = {
            ts: "2026-05-17T00:00:01Z",
            sub: "review",
            topic_hash: "h3",
            lib_hash: "h4",
            tools_granted: ["Read", "Glob"],
            dispatch_mode: "fork",
            outcome: "success",
            prev_hmac: "hmac1",
            hmac: "hmac2",
            gate_result: "n_a",
            cmux_available: null,
            gate_reason: null,
        };
        await appendAuditLog(entry1, { auditDir: TMP_DIR });
        await appendAuditLog(entry2, { auditDir: TMP_DIR });
        const lines = readFileSync(resolve(TMP_DIR, "dispatch.log"), "utf-8").trim().split("\n");
        expect(lines).toHaveLength(2);
        const parsed2 = JSON.parse(lines[1]);
        expect(parsed2.prev_hmac).toBe("hmac1");
    });
    it("does not write to .forge/ directory", async () => {
        await appendAuditLog({
            ts: "2026-05-17T00:00:00Z",
            sub: "test",
            topic_hash: "x",
            lib_hash: "y",
            tools_granted: [],
            dispatch_mode: "inline",
            outcome: "success",
            prev_hmac: "",
            hmac: "h",
            gate_result: "n_a",
            cmux_available: null,
            gate_reason: null,
        }, { auditDir: TMP_DIR });
        const workspaceAuditDir = resolve(process.cwd(), ".forge/debug");
        expect(existsSync(resolve(workspaceAuditDir, "dispatch.log"))).toBe(false);
    });
    it("writes gate_result fields for cmux-gated entry", async () => {
        await appendAuditLog({
            ts: "2026-05-24T00:00:00Z",
            sub: "forge-cmux-sidebar-sync",
            topic_hash: "g1",
            lib_hash: "",
            tools_granted: [],
            dispatch_mode: "n_a",
            outcome: "rejected",
            prev_hmac: "",
            hmac: "hgate",
            gate_result: "blocked",
            cmux_available: false,
            gate_reason: "socket_missing",
        }, { auditDir: TMP_DIR });
        const line = readFileSync(resolve(TMP_DIR, "dispatch.log"), "utf-8").trim();
        const parsed = JSON.parse(line);
        expect(parsed.gate_result).toBe("blocked");
        expect(parsed.cmux_available).toBe(false);
        expect(parsed.gate_reason).toBe("socket_missing");
    });
    it("writes n_a gate fields for non-cmux entry", async () => {
        await appendAuditLog({
            ts: "2026-05-24T00:00:01Z",
            sub: "build",
            topic_hash: "n1",
            lib_hash: "lib1",
            tools_granted: ["Read"],
            dispatch_mode: "inline",
            outcome: "success",
            prev_hmac: "",
            hmac: "hna",
            gate_result: "n_a",
            cmux_available: null,
            gate_reason: null,
        }, { auditDir: TMP_DIR });
        const line = readFileSync(resolve(TMP_DIR, "dispatch.log"), "utf-8").trim();
        const parsed = JSON.parse(line);
        expect(parsed.gate_result).toBe("n_a");
        expect(parsed.cmux_available).toBeNull();
        expect(parsed.gate_reason).toBeNull();
    });
});
//# sourceMappingURL=audit-log.test.js.map