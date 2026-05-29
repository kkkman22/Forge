import { describe, expect, it } from "vitest";
import { findFrontmatterRange, isFrontmatterOnlyChange, parseDiffHunks, } from "../../src/docs-governance/updated-auditor.js";
describe("findFrontmatterRange", () => {
    it("finds frontmatter range in typical doc", () => {
        const lines = ["---", "title: Test", "updated: 2026-05-01", "---", "", "Body content"];
        const range = findFrontmatterRange(lines);
        expect(range).toEqual({ start: 0, end: 3 });
    });
    it("returns null when no frontmatter", () => {
        const lines = ["Just content", "No frontmatter"];
        const range = findFrontmatterRange(lines);
        expect(range).toBeNull();
    });
    it("handles BOM on first line", () => {
        const lines = ["﻿---", "title: Test", "---", "Body"];
        const range = findFrontmatterRange(lines);
        expect(range).toEqual({ start: 0, end: 2 });
    });
});
describe("parseDiffHunks", () => {
    it("parses unified diff hunks", () => {
        const diff = `@@ -1,3 +1,4 @@
-title: Old
+title: New
+audience: [user]
 ##`;
        const hunks = parseDiffHunks(diff);
        expect(hunks).toHaveLength(1);
        expect(hunks[0].oldStart).toBe(1);
    });
});
describe("isFrontmatterOnlyChange", () => {
    it("returns true when all changes are in frontmatter", () => {
        const fileContent = "---\ntitle: Test\nupdated: 2026-05-01\n---\n\nBody here";
        const diff = `@@ -1,3 +1,3 @@
-title: Old
+title: New`;
        expect(isFrontmatterOnlyChange(fileContent, diff)).toBe(true);
    });
    it("returns false when changes touch body", () => {
        const fileContent = "---\ntitle: Test\n---\n\nBody line 1\nBody line 2";
        const diff = `@@ -5,2 +5,2 @@
-Body line 1
+Body line changed`;
        expect(isFrontmatterOnlyChange(fileContent, diff)).toBe(false);
    });
    it("returns false when no frontmatter", () => {
        const fileContent = "Just body content";
        const diff = `@@ -1 +1 @@
-Just body content
+Changed content`;
        expect(isFrontmatterOnlyChange(fileContent, diff)).toBe(false);
    });
});
//# sourceMappingURL=updated-auditor.test.js.map