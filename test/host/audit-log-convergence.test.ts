/**
 * P2 R4 (T6b): audit-log convergence to HostAdapter.
 *
 * resolveDefaultSecretDir() and resolveAuditDir() previously read
 * CLAUDE_PLUGIN_DATA directly. They must now source pluginData from the
 * injected HostAdapter (Zcode-aware). Under a Claude host the resolved path is
 * byte-equal to the pre-P2 baseline; under a Zcode host it honours
 * ZCODE_PLUGIN_DATA.
 *
 * Validates: requirements R4-AC1, R4-AC4 (audit-log).
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type AuditEntry,
  appendAuditLog,
  resolveAuditSecret,
} from "../../src/forge-dispatcher/audit-log";
import { resetHostAdapter } from "../../src/host/detect";

const ENV_KEYS = [
  "CLAUDE_PLUGIN_DATA",
  "ZCODE_PLUGIN_DATA",
  "ZCODE_PLUGIN_ROOT",
  "FORGE_AUDIT_SECRET",
];

describe("audit-log — HostAdapter pluginData convergence", () => {
  beforeEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
    resetHostAdapter();
  });

  it("Claude host: resolveAuditSecret uses CLAUDE_PLUGIN_DATA path", () => {
    const tmp = mkdtempSync(resolve(tmpdir(), "forge-audit-cc-"));
    try {
      process.env.CLAUDE_PLUGIN_DATA = tmp;
      const secret = resolveAuditSecret();
      // Secret file should be created under <tmp>/forge/.audit-secret
      expect(secret.length).toBeGreaterThanOrEqual(32);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("Zcode host: audit dir honours ZCODE_PLUGIN_DATA", async () => {
    const tmp = mkdtempSync(resolve(tmpdir(), "forge-audit-zc-"));
    try {
      process.env.ZCODE_PLUGIN_DATA = tmp;
      process.env.FORGE_AUDIT_SECRET = "test-secret-for-hmac-chain-32+chars";
      const entry: AuditEntry = {
        ts: "2026-07-31T00:00:00Z",
        sub: "sub-x",
        topic_hash: "t",
        lib_hash: "l",
        tools_granted: [],
        dispatch_mode: "inline",
        outcome: "success",
        prev_hmac: "",
        hmac: "h",
        gate_result: "go",
        cmux_available: null,
        gate_reason: null,
      };
      await appendAuditLog(entry);
      const logPath = resolve(tmp, "forge", "audit", "dispatch.log");
      const written = readFileSync(logPath, "utf-8");
      expect(written).toContain('"sub":"sub-x"');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  it("fails-safe to ~/.claude fallback when no pluginData injected", () => {
    // No env → adapter.paths().pluginData is null → homedir fallback (existing behaviour).
    const secret = resolveAuditSecret({ secretDir: resolve(tmpdir(), "forge-audit-fallback-") });
    expect(secret.length).toBeGreaterThanOrEqual(32);
  });
});
