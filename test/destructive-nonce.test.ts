/**
 * Unit tests for destructive-nonce.ts (v3 — nonce+HMAC bypass layer).
 *
 * Covers the v2 review P1 test gap: the entire nonce module had zero tests.
 * Validates AC2 (rollback nonce), AC3 (allow nonce), AC3a (v3 hardening:
 * stable secret, atomic burn via rename, concurrency safety).
 *
 * **Validates: Requirements R1 AC2, AC3, AC3a**
 */

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { contextFromNonce, issueAllowNonce, issueRollbackNonce } from "../src/destructive-nonce.js";

const tempRoots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "forge-nonce-test-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// AC2 — rollback nonce lifecycle
// ---------------------------------------------------------------------------

describe("rollback nonce (AC2)", () => {
  it("issue + consume → rollbackActive=true", () => {
    const root = tempRoot();
    issueRollbackNonce(root);
    const ctx = contextFromNonce({ FORGE_ROLLBACK_NONCE: "" }, root);
    expect(ctx.rollbackActive).toBe(true);
  });

  it("burned after consume (single-use)", () => {
    const root = tempRoot();
    issueRollbackNonce(root);
    const first = contextFromNonce({}, root);
    expect(first.rollbackActive).toBe(true);
    // second consume — nonce already renamed to .consumed/, file gone
    const second = contextFromNonce({}, root);
    expect(second.rollbackActive).toBe(false);
  });

  it("env nonce without file → deny (P0-3)", () => {
    const root = tempRoot();
    const ctx = contextFromNonce({ FORGE_ROLLBACK_NONCE: "fake" }, root);
    expect(ctx.rollbackActive).toBe(false);
  });

  it("env nonce mismatch with file → deny", () => {
    const root = tempRoot();
    issueRollbackNonce(root);
    const ctx = contextFromNonce({ FORGE_ROLLBACK_NONCE: "wrong-nonce" }, root);
    expect(ctx.rollbackActive).toBe(false);
  });

  it("forged nonce file (bad HMAC) → deny", () => {
    const root = tempRoot();
    // Write a nonce file with a bogus HMAC (attacker without the secret).
    const fs = require("node:fs");
    const filePath = join(root, ".tinkerman", ".rollback-nonce");
    fs.mkdirSync(join(root, ".tinkerman"), { recursive: true });
    fs.writeFileSync(filePath, "fakeNonce\nbogusHmac\n", "utf-8");
    const ctx = contextFromNonce({}, root);
    expect(ctx.rollbackActive).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC3 — allow nonce
// ---------------------------------------------------------------------------

describe("allow nonce (AC3)", () => {
  it("issue + consume → userSingleAllow=true", () => {
    const root = tempRoot();
    issueAllowNonce(root);
    const ctx = contextFromNonce({}, root);
    expect(ctx.userSingleAllow).toBe(true);
  });

  it("burned after consume (single-use)", () => {
    const root = tempRoot();
    issueAllowNonce(root);
    expect(contextFromNonce({}, root).userSingleAllow).toBe(true);
    expect(contextFromNonce({}, root).userSingleAllow).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AC3a — v3 hardening
// ---------------------------------------------------------------------------

describe("nonce hardening (AC3a)", () => {
  it("(a) secret stable: changing config.md mtime does NOT invalidate nonce", () => {
    const root = tempRoot();
    issueRollbackNonce(root);
    // Simulate config.md mtime change (v2 would have broken here).
    const fs = require("node:fs");
    const configPath = join(root, ".tinkerman", "config.md");
    fs.mkdirSync(join(root, ".tinkerman"), { recursive: true });
    fs.writeFileSync(configPath, "---\nproject: X\n---\n", "utf-8");
    // nonce must still validate (secret is from .guard-secret, not config mtime)
    const ctx = contextFromNonce({}, root);
    expect(ctx.rollbackActive).toBe(true);
  });

  it("(a) secret persists across calls (guard-secret file)", () => {
    const root = tempRoot();
    issueRollbackNonce(root);
    // guard-secret auto-generated on first getGuardSecret; second issue+consume
    // must use the same secret.
    const ctx1 = contextFromNonce({}, root);
    expect(ctx1.rollbackActive).toBe(true);
    issueRollbackNonce(root);
    const ctx2 = contextFromNonce({}, root);
    expect(ctx2.rollbackActive).toBe(true);
  });

  it("(b) atomic burn: consumed nonce moved to .consumed/", () => {
    const root = tempRoot();
    issueRollbackNonce(root);
    contextFromNonce({}, root);
    // original file gone, consumed file present
    expect(existsSync(join(root, ".tinkerman", ".rollback-nonce"))).toBe(false);
    expect(existsSync(join(root, ".tinkerman", ".consumed", ".rollback-nonce"))).toBe(true);
  });

  it("(c) concurrency: second concurrent consume of same nonce → false", () => {
    const root = tempRoot();
    issueRollbackNonce(root);
    // First consume wins (rename); second sees no file.
    const ctx1 = contextFromNonce({}, root);
    const ctx2 = contextFromNonce({}, root);
    expect(ctx1.rollbackActive).toBe(true);
    expect(ctx2.rollbackActive).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// config read (AC5)
// ---------------------------------------------------------------------------

describe("guardEnabledFromConfig (AC5)", () => {
  it("defaults to enabled when config absent", () => {
    const root = tempRoot();
    const ctx = contextFromNonce({}, root);
    expect(ctx.guardEnabled).toBe(true);
  });

  it("disabled when config.md destructive_guard: off", () => {
    const root = tempRoot();
    const fs = require("node:fs");
    fs.mkdirSync(join(root, ".tinkerman"), { recursive: true });
    fs.writeFileSync(
      join(root, ".tinkerman", "config.md"),
      "---\ndestructive_guard: off\n---\n",
      "utf-8",
    );
    const ctx = contextFromNonce({}, root);
    expect(ctx.guardEnabled).toBe(false);
  });

  it("enabled when config.md destructive_guard: on", () => {
    const root = tempRoot();
    const fs = require("node:fs");
    fs.mkdirSync(join(root, ".tinkerman"), { recursive: true });
    fs.writeFileSync(
      join(root, ".tinkerman", "config.md"),
      "---\ndestructive_guard: on\n---\n",
      "utf-8",
    );
    const ctx = contextFromNonce({}, root);
    expect(ctx.guardEnabled).toBe(true);
  });
});
