import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendAuditLog, computeHmac, } from "../../src/forge-dispatcher/audit-log.js";
const TMP_DIR = resolve(import.meta.dirname, "..", "__audit_hmac_tmp__");
const baseEntry = {
    ts: "2026-06-06T00:00:00Z",
    sub: "build",
    topic_hash: "abc123",
    lib_hash: "def456",
    tools_granted: ["Read", "Bash"],
    dispatch_mode: "inline",
    outcome: "success",
    prev_hmac: "",
    gate_result: "n_a",
    cmux_available: null,
    gate_reason: null,
};
describe("computeHmac uses proper HMAC (not plain hash)", () => {
    it("produces different HMACs for the same data with different keys", () => {
        vi.stubEnv("FORGE_AUDIT_SECRET", "key-alpha");
        const h1 = computeHmac("prev", { ...baseEntry });
        vi.stubEnv("FORGE_AUDIT_SECRET", "key-beta");
        const h2 = computeHmac("prev", { ...baseEntry });
        vi.unstubAllEnvs();
        expect(h1).not.toBe(h2);
    });
    it("produces deterministic output for same key + same input", () => {
        vi.stubEnv("FORGE_AUDIT_SECRET", "stable-key");
        const h1 = computeHmac("prev", { ...baseEntry });
        const h2 = computeHmac("prev", { ...baseEntry });
        vi.unstubAllEnvs();
        expect(h1).toBe(h2);
    });
    it("changes when input data changes", () => {
        vi.stubEnv("FORGE_AUDIT_SECRET", "stable-key");
        const h1 = computeHmac("prev", { ...baseEntry });
        const h2 = computeHmac("prev", { ...baseEntry, sub: "review" });
        vi.unstubAllEnvs();
        expect(h1).not.toBe(h2);
    });
    it("changes when prev_hmac changes (chain integrity)", () => {
        vi.stubEnv("FORGE_AUDIT_SECRET", "stable-key");
        const h1 = computeHmac("alpha", { ...baseEntry });
        const h2 = computeHmac("beta", { ...baseEntry });
        vi.unstubAllEnvs();
        expect(h1).not.toBe(h2);
    });
    it("falls back to a derived key when FORGE_AUDIT_SECRET is not set", () => {
        vi.stubEnv("FORGE_AUDIT_SECRET", "");
        const h = computeHmac("prev", { ...baseEntry });
        vi.unstubAllEnvs();
        // Must still produce a valid hex string (64 chars for sha256)
        expect(h).toMatch(/^[0-9a-f]{64}$/);
    });
});
describe("appendAuditLog uses async I/O", () => {
    beforeEach(() => {
        mkdirSync(TMP_DIR, { recursive: true });
    });
    afterEach(() => {
        rmSync(TMP_DIR, { recursive: true, force: true });
        vi.unstubAllEnvs();
    });
    it("writes entry with HMAC computed via createHmac", async () => {
        vi.stubEnv("FORGE_AUDIT_SECRET", "test-secret");
        const entry = {
            ...baseEntry,
            hmac: "placeholder",
        };
        // computeHmac should be used to compute hmac before writing
        const expectedHmac = computeHmac(entry.prev_hmac, entry);
        entry.hmac = expectedHmac;
        await appendAuditLog(entry, { auditDir: TMP_DIR });
        const line = readFileSync(resolve(TMP_DIR, "dispatch.log"), "utf-8").trim();
        const parsed = JSON.parse(line);
        expect(parsed.hmac).toBe(expectedHmac);
    });
});
//# sourceMappingURL=audit-hmac.test.js.map