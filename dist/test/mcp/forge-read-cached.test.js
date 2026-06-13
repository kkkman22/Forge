/**
 * forge_read_cached MCP tool — integration tests.
 *
 * Tests the full tool logic: first read returns full content, subsequent
 * reads return cached message, modified file returns diff.
 *
 * @vitest-environment node
 */
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createIndex } from "../../src/mcp/read-cache.js";
import { handleReadCached, registerForgeReadCached, } from "../../src/mcp/tools/forge-read-cached.js";
describe("forge_read_cached tool", () => {
    const tmpRoot = join(tmpdir(), `forge-test-cached-${process.pid}`);
    let index;
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
function collectReadCachedHandler(root) {
    let handler = null;
    const fakeServer = {
        tool: (_name, _desc, _schema, h) => {
            handler = h;
        },
    };
    registerForgeReadCached(fakeServer, root);
    if (!handler)
        throw new Error("forge_read_cached handler not registered");
    return handler;
}
describe("forge_read_cached session isolation (P6)", () => {
    let projectA;
    let projectB;
    beforeEach(async () => {
        projectA = await mkdtemp(join(tmpdir(), "forge-sess-a-"));
        projectB = await mkdtemp(join(tmpdir(), "forge-sess-b-"));
        await mkdir(join(projectA, ".forge"), { recursive: true });
        await mkdir(join(projectB, ".forge"), { recursive: true });
    });
    afterEach(async () => {
        await rm(projectA, { recursive: true, force: true });
        await rm(projectB, { recursive: true, force: true });
    });
    it("derives a per-project session id from root (not the global 'mcp-default')", async () => {
        const fileA = join(projectA, "a.txt");
        const fileB = join(projectB, "b.txt");
        await writeFile(fileA, "content-a\n");
        await writeFile(fileB, "content-b\n");
        // Clean any pre-existing cache files from prior runs so the assertion is
        // deterministic: after our reads, the global mcp-default file must NOT have
        // been recreated by root-scoped handlers.
        const sharedCache = join(tmpdir(), "forge-read-cache-mcp-default.json");
        await unlink(sharedCache).catch(() => { });
        const before = new Set((await readdir(tmpdir())).filter((f) => f.startsWith("forge-read-cache-")));
        const handlerA = collectReadCachedHandler({ path: projectA });
        const handlerB = collectReadCachedHandler({ path: projectB });
        await handlerA({ path: "a.txt" });
        await handlerB({ path: "b.txt" });
        // The global "mcp-default" file must NOT have been (re)created — root-scoped
        // handlers must persist under per-project ids instead.
        expect(existsSync(sharedCache), "must not write the global mcp-default cache").toBe(false);
        // Each project must get its own distinct cache file (two new files appeared).
        const after = (await readdir(tmpdir())).filter((f) => f.startsWith("forge-read-cache-"));
        const created = after.filter((f) => !before.has(f));
        expect(created.length, "each project writes its own cache file").toBe(2);
        // Sanity: projectA re-reads a.txt as cached (its entry persisted under its
        // own id, not clobbered by projectB).
        const again = await handlerA({ path: "a.txt" });
        expect(again.content[0].text).toContain("[cached]");
    });
});
describe("forge_read_cached concurrent-read safety (P6)", () => {
    let project;
    beforeEach(async () => {
        project = await mkdtemp(join(tmpdir(), "forge-conc-"));
        await mkdir(join(project, ".forge"), { recursive: true });
    });
    afterEach(async () => {
        await rm(project, { recursive: true, force: true });
    });
    it("does not lose cache entries under concurrent reads of distinct files", async () => {
        // Many distinct files read concurrently through one registered handler
        // share one session index. The old read-modify-write (load → update →
        // persist-overwrite) dropped entries written by concurrent callers.
        const files = [];
        for (let i = 0; i < 12; i++) {
            const p = join(project, `f${i}.txt`);
            await writeFile(p, `content-${i}\n`);
            files.push(p);
        }
        const handler = collectReadCachedHandler({ path: project });
        // Fire all reads concurrently.
        await Promise.all(files.map((_, i) => handler({ path: `f${i}.txt` })));
        // Re-read every file; each must report [cached] (entry preserved). If the
        // race dropped entries, some re-reads will miss the cache and return full
        // content instead of the [cached] message.
        const reReads = await Promise.all(files.map((_, i) => handler({ path: `f${i}.txt` })));
        const lost = reReads
            .map((r, i) => (r.content[0].text.includes("[cached]") ? null : `f${i}.txt`))
            .filter(Boolean);
        expect(lost, `cache entries lost to concurrent writes: ${lost.join(", ")}`).toEqual([]);
    });
});
//# sourceMappingURL=forge-read-cached.test.js.map