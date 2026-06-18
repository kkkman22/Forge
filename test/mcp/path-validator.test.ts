/**
 * Tests for shared path validation utility.
 *
 * Covers:
 *   - validatePaths from forge-read.ts (existing)
 *   - validateSinglePath from shared path-validator (new)
 *   - Prefix attack detection (originally surfaced in the read-cache tool)
 *   - Symlink escape documentation
 *
 * **Validates: T2 — Path traversal hardening**
 */
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// Import from the shared path-validator module (T2 GREEN target)
import { validateSinglePath } from "../../src/mcp/tools/path-validator.js";

describe("validateSinglePath", () => {
  it("allows paths within project root", () => {
    expect(validateSinglePath("/home/user/project/src/index.ts", "/home/user/project")).toBe(true);
  });

  it("allows relative paths resolved within project root", () => {
    expect(validateSinglePath("src/index.ts", "/home/user/project")).toBe(true);
  });

  it("rejects absolute paths escaping project root", () => {
    expect(validateSinglePath("/etc/passwd", "/home/user/project")).toBe(false);
  });

  it("rejects relative paths with .. traversal", () => {
    expect(validateSinglePath("../../../etc/passwd", "/home/user/project")).toBe(false);
  });

  it("rejects prefix attack — root is prefix of another dir", () => {
    // root = /home/user/proj, path resolves to /home/user/project2/file
    // Without proper validation, startsWith("/home/user/proj") would pass
    expect(validateSinglePath("../project2/file", "/home/user/proj")).toBe(false);
  });

  it("rejects prefix attack with trailing slash ambiguity", () => {
    // root = /tmp/test, path resolves to /tmp/test-data/file
    expect(validateSinglePath("../test-data/evil", "/tmp/test")).toBe(false);
  });

  it("allows paths at the root boundary", () => {
    // Path exactly at root should be allowed
    expect(validateSinglePath(".", "/home/user/project")).toBe(true);
  });

  it("handles deeply nested valid paths", () => {
    expect(validateSinglePath("src/mcp/tools/forge-read.ts", "/home/user/project")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// realpath branches — use real filesystem paths so realpathSync succeeds
// ---------------------------------------------------------------------------

describe("validateSinglePath — realpath branches", () => {
  let tmpRoot: string;
  let outsideDir: string;

  // Create temp dirs for realpath tests
  it.beforeAll(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "forge-pv-"));
    outsideDir = mkdtempSync(join(tmpdir(), "forge-pv-out-"));
    // Create a file inside tmpRoot
    writeFileSync(join(tmpRoot, "real.ts"), "export {}");
  });

  afterEach(() => {
    // Clean up any symlinks created during tests
    try {
      rmSync(join(tmpRoot, "evil-link"), { force: true });
    } catch {
      /* ok */
    }
  });

  it.afterAll(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
    rmSync(outsideDir, { recursive: true, force: true });
  });

  it("allows real existing paths within project root (realpath branch)", () => {
    // Path exists → realpathSync succeeds → realRel doesn't start with ".."
    expect(validateSinglePath(join(tmpRoot, "real.ts"), tmpRoot)).toBe(true);
  });

  it("rejects symlink that escapes project root (realpath .. branch)", () => {
    // Create symlink: tmpRoot/evil-link → outsideDir
    symlinkSync(outsideDir, join(tmpRoot, "evil-link"));
    // realpath of evil-link → outsideDir → relative from tmpRoot starts with ".."
    expect(validateSinglePath(join(tmpRoot, "evil-link"), tmpRoot)).toBe(false);
  });

  it("allows path exactly at root (realpath empty rel branch)", () => {
    // Path == root → realRel === "" → return true
    expect(validateSinglePath(tmpRoot, tmpRoot)).toBe(true);
  });

  it("rejects realpath prefix attack via startsWith check", () => {
    // Create a dir whose realpath is outside root but whose lexical path
    // appears inside. We use a symlink that resolves outside.
    const escapeTarget = mkdtempSync(join(tmpdir(), "forge-escape-"));
    try {
      // Symlink inside root pointing outside — the symlink itself is the test path
      symlinkSync(escapeTarget, join(tmpRoot, "escape-link"));
      // The realpath of "escape-link" → escapeTarget which doesn't start with tmpRoot/
      // and isn't equal to tmpRoot
      expect(validateSinglePath(join(tmpRoot, "escape-link"), tmpRoot)).toBe(false);
    } finally {
      rmSync(escapeTarget, { recursive: true, force: true });
    }
  });
});
