/**
 * Read cache index — unit tests.
 *
 * TDD RED phase: tests for createIndex, lookup, update operations.
 *
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest";
import { createIndex, lookup, update } from "../../src/mcp/read-cache.js";
describe("read-cache", () => {
    describe("createIndex", () => {
        it("returns an empty index with the given session ID", () => {
            const index = createIndex("test-session-1");
            expect(index.sessionId).toBe("test-session-1");
            expect(index.entries).toEqual({});
        });
        it("returns distinct indices for different session IDs", () => {
            const a = createIndex("a");
            const b = createIndex("b");
            expect(a.sessionId).not.toBe(b.sessionId);
        });
    });
    describe("lookup", () => {
        it("returns null for empty index", () => {
            const index = createIndex("s1");
            expect(lookup(index, "/some/file.ts")).toBeNull();
        });
        it("returns null for path not in index", () => {
            const index = createIndex("s1");
            update(index, "/a.ts", "hash-a", "chash-a", 100);
            expect(lookup(index, "/b.ts")).toBeNull();
        });
        it("returns entry after update", () => {
            const index = createIndex("s1");
            update(index, "/a.ts", "hash-a", "chash-a", 100);
            const entry = lookup(index, "/a.ts");
            expect(entry).not.toBeNull();
            expect(entry.path).toBe("/a.ts");
            expect(entry.gitHash).toBe("hash-a");
            expect(entry.contentHash).toBe("chash-a");
            expect(entry.charCount).toBe(100);
        });
        it("matches exact line range when specified", () => {
            const index = createIndex("s1");
            update(index, "/a.ts", "h1", "c1", 50, [1, 50]);
            // Exact match
            expect(lookup(index, "/a.ts", 1, 50)).not.toBeNull();
            // Subset — should match since [1,50] contains [10,30]
            expect(lookup(index, "/a.ts", 10, 30)).not.toBeNull();
            // Superset — should NOT match since [1,50] does not contain [1,100]
            expect(lookup(index, "/a.ts", 1, 100)).toBeNull();
        });
        it("matches without line range when index has no range", () => {
            const index = createIndex("s1");
            update(index, "/a.ts", "h1", "c1", 50);
            // No range stored, any range query should return null
            // because the cached entry covers full file but range query asks for subset
            // We treat "no range" as "full file" — so any sub-range should match
            expect(lookup(index, "/a.ts", 1, 10)).not.toBeNull();
            expect(lookup(index, "/a.ts")).not.toBeNull();
        });
        it("overwrites previous entry for same path", () => {
            const index = createIndex("s1");
            update(index, "/a.ts", "hash-v1", "chash-v1", 100);
            update(index, "/a.ts", "hash-v2", "chash-v2", 200);
            const entry = lookup(index, "/a.ts");
            expect(entry.gitHash).toBe("hash-v2");
            expect(entry.charCount).toBe(200);
        });
    });
    describe("update", () => {
        it("returns the newly created entry", () => {
            const index = createIndex("s1");
            const entry = update(index, "/a.ts", "h1", "c1", 100);
            expect(entry.path).toBe("/a.ts");
            expect(entry.gitHash).toBe("h1");
            expect(entry.contentHash).toBe("c1");
            expect(entry.charCount).toBe(100);
            expect(entry.lineRange).toBeUndefined();
            expect(typeof entry.timestamp).toBe("number");
        });
        it("stores line range when provided", () => {
            const index = createIndex("s1");
            const entry = update(index, "/a.ts", "h1", "c1", 50, [10, 30]);
            expect(entry.lineRange).toEqual([10, 30]);
        });
        it("populates entries map in the index", () => {
            const index = createIndex("s1");
            update(index, "/a.ts", "h1", "c1", 100);
            update(index, "/b.ts", "h2", "c2", 200);
            expect(Object.keys(index.entries)).toHaveLength(2);
            expect(index.entries["/a.ts"]).toBeDefined();
            expect(index.entries["/b.ts"]).toBeDefined();
        });
    });
});
//# sourceMappingURL=read-cache.test.js.map