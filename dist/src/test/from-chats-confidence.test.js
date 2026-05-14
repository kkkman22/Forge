/**
 * Integration tests for chat preference extractor.
 *
 * Covers [R10.1-R10.6]:
 *   - Confidence classification (4 levels)
 *   - Task-specific rejection
 *   - Interactive/autonomous branch
 *   - Empty directory/empty window
 *
 * **Validates: Requirements R10.1-R10.6**
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runFromChats } from "../src/chat-preference-extractor.js";
let testDir;
describe("chat preference extractor confidence [R10.3]", () => {
    afterEach(() => {
        if (testDir) {
            try {
                rmSync(testDir, { recursive: true, force: true });
            }
            catch {
                /* */
            }
        }
    });
    it("classifies 'always' patterns as strong", () => {
        testDir = join(tmpdir(), `forge-chat-strong-${Date.now()}`);
        mkdirSync(testDir, { recursive: true });
        writeFileSync(join(testDir, "transcript.md"), "You should always write tests before code");
        const result = runFromChats({ claudeDir: testDir, window: 7 });
        expect(result.strong.length).toBeGreaterThan(0);
    });
    it("classifies 'never' patterns as strong", () => {
        testDir = join(tmpdir(), `forge-chat-never-${Date.now()}`);
        mkdirSync(testDir, { recursive: true });
        writeFileSync(join(testDir, "transcript.md"), "Never push directly to main branch");
        const result = runFromChats({ claudeDir: testDir, window: 7 });
        expect(result.strong.length).toBeGreaterThan(0);
    });
    it("classifies 'should' patterns as moderate", () => {
        testDir = join(tmpdir(), `forge-chat-mod-${Date.now()}`);
        mkdirSync(testDir, { recursive: true });
        writeFileSync(join(testDir, "transcript.md"), "You should use descriptive variable names in all functions");
        const result = runFromChats({ claudeDir: testDir, window: 7 });
        expect(result.moderate.length).toBeGreaterThan(0);
    });
    it("classifies 'maybe' patterns as weak", () => {
        testDir = join(tmpdir(), `forge-chat-weak-${Date.now()}`);
        mkdirSync(testDir, { recursive: true });
        writeFileSync(join(testDir, "transcript.md"), "Maybe consider using a different approach for caching");
        const result = runFromChats({ claudeDir: testDir, window: 7 });
        expect(result.weak.length).toBeGreaterThan(0);
    });
});
describe("chat preference extractor task-specific rejection [R10.6]", () => {
    afterEach(() => {
        if (testDir) {
            try {
                rmSync(testDir, { recursive: true, force: true });
            }
            catch {
                /* */
            }
        }
    });
    it("rejects atoms containing file paths", () => {
        testDir = join(tmpdir(), `forge-chat-task-${Date.now()}`);
        mkdirSync(testDir, { recursive: true });
        writeFileSync(join(testDir, "transcript.md"), "always fix the bug in src/index.ts first");
        const result = runFromChats({ claudeDir: testDir, window: 7 });
        expect(result.skipped.length).toBeGreaterThan(0);
    });
    it("rejects atoms containing PR numbers", () => {
        testDir = join(tmpdir(), `forge-chat-pr-${Date.now()}`);
        mkdirSync(testDir, { recursive: true });
        writeFileSync(join(testDir, "transcript.md"), "always review PR #123 before merging");
        const result = runFromChats({ claudeDir: testDir, window: 7 });
        expect(result.skipped.length).toBeGreaterThan(0);
    });
});
describe("chat preference extractor edge cases [R10.7]", () => {
    it("returns 'no transcripts' message for empty directory", () => {
        testDir = join(tmpdir(), `forge-chat-empty-${Date.now()}`);
        mkdirSync(testDir, { recursive: true });
        const result = runFromChats({ claudeDir: testDir, window: 7 });
        expect(result.message).toContain("no transcripts");
        expect(result.candidates).toEqual([]);
    });
    it("returns 'no transcripts' for nonexistent directory", () => {
        const result = runFromChats({ claudeDir: "/nonexistent/.claude", window: 7 });
        expect(result.message).toContain("no transcripts");
    });
    it("never throws", () => {
        expect(() => runFromChats({ claudeDir: "/dev/null/impossible", window: 0 })).not.toThrow();
    });
});
//# sourceMappingURL=from-chats-confidence.test.js.map