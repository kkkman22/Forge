import { describe, expect, it } from "vitest";
import { isSafePathSegment, safeParseIndexRecord } from "../src/evidence-artifact.js";
import { toIsoDate } from "../src/learn.js";
import { stripQuotes } from "../src/lint/pack-rules.js";
import { transition } from "../src/workflow-graph.js";
describe("pack-rules: stripQuotes (branches)", () => {
    it("strips double quotes", () => {
        expect(stripQuotes('"hello"')).toBe("hello");
    });
    it("strips single quotes", () => {
        expect(stripQuotes("'world'")).toBe("world");
    });
    it("passes through unquoted", () => {
        expect(stripQuotes("plain")).toBe("plain");
    });
    it("handles empty string", () => {
        expect(stripQuotes('""')).toBe("");
    });
    it("does not strip mismatched quotes", () => {
        expect(stripQuotes('"hello')).toBe('"hello');
    });
});
describe("evidence-artifact: isSafePathSegment (branches)", () => {
    it("accepts alphanumeric + ._- ", () => {
        expect(isSafePathSegment("file.test-1")).toBe(true);
        expect(isSafePathSegment("a_b.c")).toBe(true);
    });
    it("rejects path traversal", () => {
        expect(isSafePathSegment("..")).toBe(false);
    });
    it("rejects slashes", () => {
        expect(isSafePathSegment("a/b")).toBe(false);
    });
    it("rejects special chars", () => {
        expect(isSafePathSegment("a;b")).toBe(false);
    });
    it("rejects empty string", () => {
        expect(isSafePathSegment("")).toBe(false);
    });
});
describe("evidence-artifact: safeParseIndexRecord (branches)", () => {
    it("parses valid JSON with path", () => {
        const r = safeParseIndexRecord('{"path":"x.ts"}');
        expect(r?.path).toBe("x.ts");
    });
    it("returns null for invalid JSON", () => {
        expect(safeParseIndexRecord("not json")).toBeNull();
    });
    it("returns null for empty string", () => {
        expect(safeParseIndexRecord("")).toBeNull();
    });
});
describe("learn: toIsoDate", () => {
    it("returns YYYY-MM-DD format", () => {
        expect(toIsoDate(new Date("2026-06-14T12:00:00Z"))).toBe("2026-06-14");
    });
});
describe("workflow-graph: transition", () => {
    it("creates a transition object", () => {
        const t = transition("build", "review");
        expect(t.from).toBe("build");
        expect(t.to).toBe("review");
        expect(t.recoveryRoute).toBe("debug");
    });
    it("supports allowRecoveryLoop flag", () => {
        const t = transition("build", "review", true);
        expect(t.allowRecoveryLoop).toBe(true);
    });
});
//# sourceMappingURL=packrules-evidence-branches.test.js.map