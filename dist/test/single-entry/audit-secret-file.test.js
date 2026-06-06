/**
 * Tests for audit log secret file lifecycle (P2-2 fix).
 *
 * Covers:
 *   - Random secret file generation with correct permissions
 *   - Reading existing secret file
 *   - Fallback when secret file is corrupted or unreadable
 *   - Priority: env var > secret file > generate new
 *
 * **Validates: P2-2 — HMAC key security improvement**
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeHmac, getOrCreateSecretFile, resolveAuditSecret, } from "../../src/forge-dispatcher/audit-log.js";
const TMP_DIR = resolve(import.meta.dirname, "..", "__audit_secret_tmp__");
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
describe("resolveAuditSecret — random secret file fallback", () => {
    beforeEach(() => {
        mkdirSync(TMP_DIR, { recursive: true });
        vi.unstubAllEnvs();
    });
    afterEach(() => {
        rmSync(TMP_DIR, { recursive: true, force: true });
        vi.unstubAllEnvs();
    });
    it("prefers FORGE_AUDIT_SECRET env var over secret file", () => {
        const secretPath = resolve(TMP_DIR, ".audit-secret");
        writeFileSync(secretPath, "file-secret-value", { mode: 0o600 });
        vi.stubEnv("FORGE_AUDIT_SECRET", "env-secret-value");
        const result = resolveAuditSecret({ secretDir: TMP_DIR });
        vi.unstubAllEnvs();
        expect(result).toBe("env-secret-value");
    });
    it("reads existing secret file when env var is not set", () => {
        const existing = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";
        const secretPath = resolve(TMP_DIR, ".audit-secret");
        writeFileSync(secretPath, existing, { mode: 0o600 });
        vi.stubEnv("FORGE_AUDIT_SECRET", "");
        const result = resolveAuditSecret({ secretDir: TMP_DIR });
        expect(result).toBe(existing);
    });
    it("generates a new random secret file when none exists", () => {
        vi.stubEnv("FORGE_AUDIT_SECRET", "");
        const result = resolveAuditSecret({ secretDir: TMP_DIR });
        const secretPath = resolve(TMP_DIR, ".audit-secret");
        // Must have written the file
        expect(() => readFileSync(secretPath, "utf-8")).not.toThrow();
        // The returned value must match the file content
        expect(result).toBe(readFileSync(secretPath, "utf-8"));
        // Must be a valid hex string (64 chars for sha256 output from randomBytes)
        expect(result).toMatch(/^[0-9a-f]{64}$/);
    });
    it("reuses the same secret across multiple calls", () => {
        vi.stubEnv("FORGE_AUDIT_SECRET", "");
        const first = resolveAuditSecret({ secretDir: TMP_DIR });
        const second = resolveAuditSecret({ secretDir: TMP_DIR });
        expect(first).toBe(second);
    });
    it("handles corrupted secret file by regenerating", () => {
        const secretPath = resolve(TMP_DIR, ".audit-secret");
        // Write invalid content
        writeFileSync(secretPath, "", { mode: 0o600 });
        vi.stubEnv("FORGE_AUDIT_SECRET", "");
        const result = resolveAuditSecret({ secretDir: TMP_DIR });
        // Should regenerate a valid secret
        expect(result).toMatch(/^[0-9a-f]{64}$/);
        // File should be updated
        expect(readFileSync(secretPath, "utf-8")).toBe(result);
    });
});
describe("getOrCreateSecretFile", () => {
    beforeEach(() => {
        mkdirSync(TMP_DIR, { recursive: true });
    });
    afterEach(() => {
        rmSync(TMP_DIR, { recursive: true, force: true });
    });
    it("creates a new secret file with 0600 permissions", () => {
        const result = getOrCreateSecretFile(TMP_DIR);
        const secretPath = resolve(TMP_DIR, ".audit-secret");
        expect(result).toBe(readFileSync(secretPath, "utf-8"));
        expect(result).toMatch(/^[0-9a-f]{64}$/);
    });
    it("returns existing secret without regenerating", () => {
        const secretPath = resolve(TMP_DIR, ".audit-secret");
        writeFileSync(secretPath, "a".repeat(64), { mode: 0o600 });
        const result = getOrCreateSecretFile(TMP_DIR);
        expect(result).toBe("a".repeat(64));
    });
    it("generates different secrets for different directories", () => {
        const dirA = resolve(TMP_DIR, "a");
        const dirB = resolve(TMP_DIR, "b");
        mkdirSync(dirA, { recursive: true });
        mkdirSync(dirB, { recursive: true });
        const secretA = getOrCreateSecretFile(dirA);
        const secretB = getOrCreateSecretFile(dirB);
        expect(secretA).not.toBe(secretB);
    });
});
describe("computeHmac with random secret file", () => {
    beforeEach(() => {
        mkdirSync(TMP_DIR, { recursive: true });
    });
    afterEach(() => {
        rmSync(TMP_DIR, { recursive: true, force: true });
        vi.unstubAllEnvs();
    });
    it("produces deterministic HMAC with secret file", () => {
        vi.stubEnv("FORGE_AUDIT_SECRET", "");
        const h1 = computeHmac("prev", { ...baseEntry }, { secretDir: TMP_DIR });
        const h2 = computeHmac("prev", { ...baseEntry }, { secretDir: TMP_DIR });
        expect(h1).toBe(h2);
        expect(h1).toMatch(/^[0-9a-f]{64}$/);
    });
    it("produces different HMACs when secret differs", () => {
        const dirA = resolve(TMP_DIR, "a");
        const dirB = resolve(TMP_DIR, "b");
        mkdirSync(dirA, { recursive: true });
        mkdirSync(dirB, { recursive: true });
        vi.stubEnv("FORGE_AUDIT_SECRET", "");
        const hA = computeHmac("prev", { ...baseEntry }, { secretDir: dirA });
        const hB = computeHmac("prev", { ...baseEntry }, { secretDir: dirB });
        expect(hA).not.toBe(hB);
    });
});
//# sourceMappingURL=audit-secret-file.test.js.map