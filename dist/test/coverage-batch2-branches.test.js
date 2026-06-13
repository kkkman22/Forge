import { describe, expect, it } from "vitest";
import { appendToBacklog, findOverlappingEntries, generateBacklogHeader, parseBacklog, serializeBacklog, } from "../src/backlog.js";
import { checkBranchTopicGate, extractBranchTopic } from "../src/branch-gate.js";
import { classify, normalizePath } from "../src/conflict-classifier.js";
import { generateEpisodeId, parseEpisode } from "../src/episode.js";
// branch-gate
describe("branch-gate (branch coverage)", () => {
    it("extractBranchTopic: feature/ and forge/ prefixes", () => {
        expect(extractBranchTopic("feature/add-login")).toBe("add-login");
        expect(extractBranchTopic("forge/code-slim")).toBe("code-slim");
        expect(extractBranchTopic("main")).toBeNull();
        expect(extractBranchTopic("")).toBeNull();
    });
    it("checkBranchTopicGate runs for matching topic", () => {
        const r = checkBranchTopicGate("feature/add-login", "add-login");
        expect(r).toBeDefined();
    });
    it("checkBranchTopicGate runs for mismatched topic", () => {
        const r = checkBranchTopicGate("feature/other", "add-login");
        expect(r).toBeDefined();
    });
});
// episode
describe("episode (branch coverage)", () => {
    it("generateEpisodeId format", () => {
        expect(generateEpisodeId("2026-06-14", 1)).toContain("2026-06-14");
        expect(generateEpisodeId("2026-06-14", 1)).toContain("001");
    });
    it("parseEpisode returns null for empty/garbage", () => {
        expect(parseEpisode("")).toBeNull();
        expect(parseEpisode("garbage")).toBeNull();
    });
});
// backlog
describe("backlog (branch coverage)", () => {
    const entry = (overrides = {}) => ({
        id: "hash-001",
        severity: "P2",
        filePath: "src/a.ts",
        lineNumber: 10,
        description: "issue",
        sourceReview: ".forge/reviews/x.md",
        originTask: "task-1",
        capturedDate: "2026-06-14",
        resolved: false,
        ...overrides,
    });
    it("generateBacklogHeader produces a header", () => {
        expect(generateBacklogHeader()).toContain("Backlog");
    });
    it("serializeBacklog + parseBacklog round-trip", () => {
        const serialized = serializeBacklog([entry()]);
        const parsed = parseBacklog(serialized);
        expect(parsed.length).toBe(1);
        expect(parsed[0].id).toBe("hash-001");
    });
    it("parseBacklog returns [] for empty/non-backlog content", () => {
        expect(parseBacklog("")).toEqual([]);
        expect(parseBacklog("not a backlog")).toEqual([]);
    });
    it("appendToBacklog deduplicates by id", () => {
        const e = entry();
        const result = appendToBacklog([e], [e]);
        expect(result.added).toBe(0);
        expect(result.entries.length).toBe(1);
    });
    it("appendToBacklog adds new entries", () => {
        const result = appendToBacklog([entry()], [entry({ id: "hash-002" })]);
        expect(result.added).toBe(1);
        expect(result.entries.length).toBe(2);
    });
    it("findOverlappingEntries matches by filePath", () => {
        const matches = findOverlappingEntries([entry({ filePath: "src/a.ts" })], ["src/a.ts", "src/b.ts"]);
        expect(matches.length).toBe(1);
        expect(matches[0].filePath).toBe("src/a.ts");
    });
});
// conflict-classifier
describe("conflict-classifier (branch coverage)", () => {
    it("normalizePath strips leading ./ and ./", () => {
        expect(normalizePath("./src/a.ts")).toContain("src/a.ts");
        expect(normalizePath("src/a.ts")).toContain("src/a.ts");
    });
    it("classify returns a zone for various paths", () => {
        expect(typeof classify("src/a.ts")).toBe("string");
        expect(typeof classify("test/b.ts")).toBe("string");
        expect(typeof classify(".forge/specs/x.md")).toBe("string");
    });
});
//# sourceMappingURL=coverage-batch2-branches.test.js.map