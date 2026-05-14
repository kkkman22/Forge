/**
 * Tests for Sub-Agent dynamic context injection.
 *
 * Covers:
 *   - JSONL read/write round-trip
 *   - Merge deduplication
 *   - Empty/missing JSONL file handling
 *   - context_files frontmatter parsing
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6**
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { appendContextEntry, mergeContextSources, readContextEntries, } from "../src/context-injection.js";
import { extractListField, parseFrontmatter } from "../src/frontmatter.js";
// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------
let testDir;
beforeEach(() => {
    testDir = join(tmpdir(), `forge-ctx-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });
});
afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
});
// ---------------------------------------------------------------------------
// JSONL read/write round-trip (Requirements 1.2, 1.3, 1.5)
// ---------------------------------------------------------------------------
describe("JSONL read/write", () => {
    it("round-trips a single entry", () => {
        const filePath = join(testDir, "context.jsonl");
        const entry = {
            file: "specs/api-design.md",
            reason: "discovered during task-3",
            task: "task-3",
        };
        appendContextEntry(filePath, entry);
        const entries = readContextEntries(filePath);
        expect(entries).toHaveLength(1);
        expect(entries[0]).toEqual(entry);
    });
    it("round-trips multiple entries preserving order", () => {
        const filePath = join(testDir, "context.jsonl");
        const entries = [
            { file: "specs/api-design.md", reason: "api spec", task: "task-1" },
            { file: "src/auth.ts:42-60", reason: "existing auth pattern", task: "task-1" },
            { file: "specs/error-handling.md", reason: "discovered during task-3", task: "task-3" },
        ];
        for (const entry of entries) {
            appendContextEntry(filePath, entry);
        }
        const result = readContextEntries(filePath);
        expect(result).toEqual(entries);
    });
    it("handles entries with special characters in fields", () => {
        const filePath = join(testDir, "context.jsonl");
        const entry = {
            file: "src/utils/path-helper.ts",
            reason: 'contains "quoted" strings & special <chars>',
            task: "task-5",
        };
        appendContextEntry(filePath, entry);
        const result = readContextEntries(filePath);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(entry);
    });
});
// ---------------------------------------------------------------------------
// Empty/missing JSONL file handling (Requirement 1.6)
// ---------------------------------------------------------------------------
describe("empty/missing JSONL handling", () => {
    it("returns empty array for non-existent file", () => {
        const filePath = join(testDir, "does-not-exist.jsonl");
        const entries = readContextEntries(filePath);
        expect(entries).toEqual([]);
    });
    it("returns empty array for empty file", () => {
        const filePath = join(testDir, "empty.jsonl");
        writeFileSync(filePath, "", "utf-8");
        const entries = readContextEntries(filePath);
        expect(entries).toEqual([]);
    });
    it("returns empty array for file with only whitespace", () => {
        const filePath = join(testDir, "whitespace.jsonl");
        writeFileSync(filePath, "  \n\n  \n", "utf-8");
        const entries = readContextEntries(filePath);
        expect(entries).toEqual([]);
    });
    it("skips malformed JSON lines gracefully", () => {
        const filePath = join(testDir, "mixed.jsonl");
        const validEntry = {
            file: "specs/api.md",
            reason: "valid",
            task: "task-1",
        };
        const content = [
            JSON.stringify(validEntry),
            "this is not json",
            '{"file": "partial.md"}',
            JSON.stringify({ file: "specs/b.md", reason: "also valid", task: "task-2" }),
        ].join("\n");
        writeFileSync(filePath, content, "utf-8");
        const entries = readContextEntries(filePath);
        expect(entries).toHaveLength(2);
        expect(entries[0]).toEqual(validEntry);
        expect(entries[1]).toEqual({ file: "specs/b.md", reason: "also valid", task: "task-2" });
    });
    it("skips entries missing required fields", () => {
        const filePath = join(testDir, "incomplete.jsonl");
        const content = [
            '{"file": "a.md", "reason": "ok", "task": "t1"}',
            '{"file": "b.md", "reason": "missing task"}',
            '{"file": "c.md", "task": "missing reason"}',
            '{"reason": "missing file", "task": "t2"}',
            '{"file": 123, "reason": "wrong type", "task": "t3"}',
        ].join("\n");
        writeFileSync(filePath, content, "utf-8");
        const entries = readContextEntries(filePath);
        expect(entries).toHaveLength(1);
        expect(entries[0].file).toBe("a.md");
    });
});
// ---------------------------------------------------------------------------
// Merge deduplication (Requirement 1.4)
// ---------------------------------------------------------------------------
describe("mergeContextSources", () => {
    it("merges static and dynamic sources", () => {
        const planFiles = ["specs/api-design.md", "specs/data-model.md"];
        const jsonlEntries = [
            { file: "specs/error-handling.md", reason: "discovered", task: "task-3" },
        ];
        const result = mergeContextSources(planFiles, jsonlEntries);
        expect(result).toEqual([
            "specs/api-design.md",
            "specs/data-model.md",
            "specs/error-handling.md",
        ]);
    });
    it("deduplicates by file path", () => {
        const planFiles = ["specs/api-design.md", "specs/data-model.md"];
        const jsonlEntries = [
            { file: "specs/api-design.md", reason: "also found here", task: "task-2" },
            { file: "specs/new.md", reason: "new discovery", task: "task-3" },
        ];
        const result = mergeContextSources(planFiles, jsonlEntries);
        expect(result).toEqual(["specs/api-design.md", "specs/data-model.md", "specs/new.md"]);
    });
    it("deduplicates within plan files", () => {
        const planFiles = ["specs/api.md", "specs/api.md", "specs/data.md"];
        const result = mergeContextSources(planFiles, []);
        expect(result).toEqual(["specs/api.md", "specs/data.md"]);
    });
    it("deduplicates within JSONL entries", () => {
        const jsonlEntries = [
            { file: "specs/api.md", reason: "first", task: "task-1" },
            { file: "specs/api.md", reason: "second", task: "task-2" },
        ];
        const result = mergeContextSources([], jsonlEntries);
        expect(result).toEqual(["specs/api.md"]);
    });
    it("returns empty array when both sources are empty", () => {
        const result = mergeContextSources([], []);
        expect(result).toEqual([]);
    });
    it("returns only plan files when JSONL is empty", () => {
        const planFiles = ["specs/api.md"];
        const result = mergeContextSources(planFiles, []);
        expect(result).toEqual(["specs/api.md"]);
    });
    it("returns only JSONL files when plan is empty", () => {
        const jsonlEntries = [
            { file: "specs/api.md", reason: "found", task: "task-1" },
        ];
        const result = mergeContextSources([], jsonlEntries);
        expect(result).toEqual(["specs/api.md"]);
    });
    it("preserves static-first ordering", () => {
        const planFiles = ["z-file.md", "a-file.md"];
        const jsonlEntries = [{ file: "m-file.md", reason: "mid", task: "task-1" }];
        const result = mergeContextSources(planFiles, jsonlEntries);
        expect(result).toEqual(["z-file.md", "a-file.md", "m-file.md"]);
    });
    it("treats file paths with line ranges as distinct", () => {
        const planFiles = ["src/auth.ts"];
        const jsonlEntries = [
            { file: "src/auth.ts:42-60", reason: "specific range", task: "task-1" },
        ];
        const result = mergeContextSources(planFiles, jsonlEntries);
        expect(result).toEqual(["src/auth.ts", "src/auth.ts:42-60"]);
    });
});
// ---------------------------------------------------------------------------
// context_files frontmatter parsing (Requirement 1.1)
// ---------------------------------------------------------------------------
describe("context_files frontmatter parsing", () => {
    it("extracts context_files list from plan frontmatter", () => {
        const content = [
            "---",
            "status: approved",
            "topic: user-pagination",
            "context_files:",
            "  - specs/api-design.md",
            "  - specs/data-model.md",
            "---",
            "# Plan body",
        ].join("\n");
        const parsed = parseFrontmatter(content);
        if (!parsed)
            throw new Error("expected parsed frontmatter");
        const files = extractListField(parsed.raw, "context_files");
        expect(files).toEqual(["specs/api-design.md", "specs/data-model.md"]);
    });
    it("returns empty array when context_files is not present", () => {
        const content = ["---", "status: approved", "topic: user-pagination", "---", "# Plan"].join("\n");
        const parsed = parseFrontmatter(content);
        if (!parsed)
            throw new Error("expected parsed frontmatter");
        const files = extractListField(parsed.raw, "context_files");
        expect(files).toEqual([]);
    });
    it("returns empty array for empty list syntax", () => {
        const content = ["---", "status: approved", "context_files: []", "---", "# Plan"].join("\n");
        const parsed = parseFrontmatter(content);
        if (!parsed)
            throw new Error("expected parsed frontmatter");
        const files = extractListField(parsed.raw, "context_files");
        expect(files).toEqual([]);
    });
    it("handles single-item list", () => {
        const content = [
            "---",
            "status: approved",
            "context_files:",
            "  - specs/only-one.md",
            "---",
            "# Plan",
        ].join("\n");
        const parsed = parseFrontmatter(content);
        if (!parsed)
            throw new Error("expected parsed frontmatter");
        const files = extractListField(parsed.raw, "context_files");
        expect(files).toEqual(["specs/only-one.md"]);
    });
    it("handles context_files followed by another field", () => {
        const content = [
            "---",
            "context_files:",
            "  - specs/api.md",
            "  - specs/data.md",
            "status: approved",
            "---",
            "# Plan",
        ].join("\n");
        const parsed = parseFrontmatter(content);
        if (!parsed)
            throw new Error("expected parsed frontmatter");
        const files = extractListField(parsed.raw, "context_files");
        expect(files).toEqual(["specs/api.md", "specs/data.md"]);
    });
    it("works with different list field names", () => {
        const content = [
            "---",
            "verify_commands:",
            "  - npm run lint",
            "  - npm run typecheck",
            "  - npm test -- --run",
            "---",
            "# Config",
        ].join("\n");
        const parsed = parseFrontmatter(content);
        if (!parsed)
            throw new Error("expected parsed frontmatter");
        const commands = extractListField(parsed.raw, "verify_commands");
        expect(commands).toEqual(["npm run lint", "npm run typecheck", "npm test -- --run"]);
    });
});
//# sourceMappingURL=context-injection.test.js.map