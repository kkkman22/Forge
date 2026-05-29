/**
 * Read cache hash/diff operations — unit tests.
 *
 * TDD RED phase: tests for getFileHash and getFileDiff.
 *
 * @vitest-environment node
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getFileDiff, getFileHash } from "../../src/mcp/read-cache-hash.js";

describe("read-cache-hash", () => {
  const tmpRoot = join(tmpdir(), `forge-test-hash-${process.pid}`);

  beforeEach(async () => {
    await mkdir(tmpRoot, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  describe("getFileHash", () => {
    it("returns a 40-char hex string for a tracked file", async () => {
      // Create a file in the actual git repo (worktree) — it will be untracked
      // but getFileHash should fallback to SHA-256 for untracked files
      const filePath = join(tmpRoot, "test-file.txt");
      await writeFile(filePath, "hello world\n");
      const hash = await getFileHash(filePath);
      expect(hash).toMatch(/^[0-9a-f]{40,64}$/);
    });

    it("returns consistent hash for same content", async () => {
      const filePath = join(tmpRoot, "consistent.txt");
      await writeFile(filePath, "same content\n");
      const h1 = await getFileHash(filePath);
      const h2 = await getFileHash(filePath);
      expect(h1).toBe(h2);
    });

    it("returns different hash when content changes", async () => {
      const filePath = join(tmpRoot, "mutable.txt");
      await writeFile(filePath, "version 1\n");
      const h1 = await getFileHash(filePath);
      await writeFile(filePath, "version 2\n");
      const h2 = await getFileHash(filePath);
      expect(h1).not.toBe(h2);
    });

    it("throws for non-existent file", async () => {
      await expect(getFileHash(join(tmpRoot, "nope.txt"))).rejects.toThrow();
    });
  });

  describe("getFileDiff", () => {
    it("returns non-empty string when file changed between hashes", async () => {
      // Use a file in the git worktree to test git diff
      // We'll create, add, modify to get two hashes
      const filePath = join(tmpRoot, "diff-test.txt");

      await writeFile(filePath, "original\n");
      const hash1 = await getFileHash(filePath);

      await writeFile(filePath, "modified\n");
      const hash2 = await getFileHash(filePath);

      // Both are SHA-256 hashes (untracked file) — getFileDiff uses git diff
      // For untracked files, this won't work with git object hashes.
      // Instead, it returns the full content as "diff" since there's no git history.
      const diff = await getFileDiff(filePath, hash1, hash2);
      expect(typeof diff).toBe("string");
      // At minimum it should mention the changed content
      expect(diff.length).toBeGreaterThan(0);
    });

    it("returns empty string when hashes are identical", async () => {
      const filePath = join(tmpRoot, "same.txt");
      await writeFile(filePath, "unchanged\n");
      const hash = await getFileHash(filePath);
      const diff = await getFileDiff(filePath, hash, hash);
      // Same hash = no diff
      expect(diff).toBe("");
    });
  });
});
