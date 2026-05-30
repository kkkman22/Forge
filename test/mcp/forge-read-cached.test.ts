/**
 * forge_read_cached MCP tool — integration tests.
 *
 * Tests the full tool logic: first read returns full content, subsequent
 * reads return cached message, modified file returns diff.
 *
 * @vitest-environment node
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createIndex, type ReadCacheIndex } from "../../src/mcp/read-cache.js";
import { handleReadCached } from "../../src/mcp/tools/forge-read-cached.js";

describe("forge_read_cached tool", () => {
  const tmpRoot = join(tmpdir(), `forge-test-cached-${process.pid}`);
  let index: ReadCacheIndex;

  beforeEach(async () => {
    await mkdir(tmpRoot, { recursive: true });
    index = createIndex(`test-${process.pid}`);
  });

  afterEach(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  it("returns full content on first read", async () => {
    const filePath = join(tmpRoot, "first.txt");
    await writeFile(filePath, "hello world\n");

    const result = await handleReadCached(index, filePath);
    expect(result.cached).toBe(false);
    expect(result.content).toContain("hello world");
    expect(result.content).not.toContain("[cached]");
    // Index should now have an entry
    expect(index.entries[filePath]).toBeDefined();
  });

  it("returns cached message on second read of unchanged file", async () => {
    const filePath = join(tmpRoot, "cached.txt");
    await writeFile(filePath, "unchanged content\n");

    // First read
    await handleReadCached(index, filePath);
    // Second read
    const result = await handleReadCached(index, filePath);
    expect(result.cached).toBe(true);
    expect(result.content).toContain("[cached]");
    expect(result.content).toContain(filePath);
  });

  it("returns diff when file is modified", async () => {
    const filePath = join(tmpRoot, "modified.txt");
    await writeFile(filePath, "version 1\n");

    // First read
    await handleReadCached(index, filePath);

    // Modify file
    await writeFile(filePath, "version 2\n");

    // Second read — should detect change
    const result = await handleReadCached(index, filePath);
    expect(result.cached).toBe(false);
    expect(result.content).toContain("version 2");
    // Index should be updated with new hash
    expect(index.entries[filePath]).toBeDefined();
  });

  it("handles non-existent file gracefully", async () => {
    const filePath = join(tmpRoot, "nope.txt");
    const result = await handleReadCached(index, filePath);
    expect(result.cached).toBe(false);
    expect(result.content).toContain("Error");
  });

  it("respects line range on first read", async () => {
    const filePath = join(tmpRoot, "lines.txt");
    await writeFile(filePath, "line1\nline2\nline3\nline4\nline5\n");

    const result = await handleReadCached(index, filePath, 2, 4);
    expect(result.cached).toBe(false);
    // Content should include lines 2-4
    expect(result.content).toContain("line2");
    expect(result.content).toContain("line4");
  });

  it("respects start_line only (no end_line)", async () => {
    const filePath = join(tmpRoot, "partial.txt");
    await writeFile(filePath, "a\nb\nc\nd\n");

    const result = await handleReadCached(index, filePath, 3);
    expect(result.cached).toBe(false);
    expect(result.content).toContain("c");
    expect(result.content).toContain("d");
    expect(result.content).not.toContain("a");
  });

  it("respects end_line only (no start_line)", async () => {
    const filePath = join(tmpRoot, "partial2.txt");
    await writeFile(filePath, "x\ny\nz\n");

    const result = await handleReadCached(index, filePath, undefined, 2);
    expect(result.cached).toBe(false);
    expect(result.content).toContain("x");
    expect(result.content).toContain("y");
    expect(result.content).not.toContain("z");
  });
});
