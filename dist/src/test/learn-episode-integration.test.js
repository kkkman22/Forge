/**
 * Integration tests for the episode + pattern lifecycle integration in
 * `src/learn.ts`.
 *
 * Covers:
 *   - `buildEpisodeFromSession` produces a schema_version=2 episode,
 *     infers the outcome from review/test/ship signals, and attributes
 *     the episode to the correct skill via the phase history.
 *     (Requirement 7.9)
 *   - `archivePatternByName` is a pure, case-insensitive move that
 *     never deletes: the sum of `active` + `archived` equals the input
 *     (Requirements 7.10, 7.14).
 *   - `buildPatternUpgradeDrafts` promotes 3+ same-root-cause episodes
 *     into a full `Pattern` draft ready for user confirmation
 *     (Requirement 7.11).
 *   - `getLearnPromptConfig` never requires a numeric rating and only
 *     demands a failure reason on `failure` outcomes (Requirement 7.15).
 *
 * **Validates: Requirements 7.9, 7.10, 7.11, 7.14, 7.15**
 */
import { describe, expect, it } from "vitest";
import { renderEpisode } from "../src/episode.js";
import { archivePatternByName, buildEpisodeFromSession, buildPatternUpgradeDrafts, getLearnPromptConfig, } from "../src/learn.js";
// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const META = {
    topic: "skills-cross-pollination",
    tier: "full",
    date: "2026-05-05",
};
function phaseHistory(overrides = {}) {
    return {
        phases: [
            { phase: "router", at: "2026-05-05T08:00:00Z" },
            { phase: "spec", at: "2026-05-05T08:10:00Z" },
            { phase: "plan", at: "2026-05-05T08:30:00Z" },
            { phase: "build", at: "2026-05-05T09:00:00Z" },
            { phase: "review", at: "2026-05-05T10:00:00Z" },
            { phase: "test", at: "2026-05-05T11:00:00Z" },
            { phase: "ship", at: "2026-05-05T12:00:00Z" },
            { phase: "learn", at: "2026-05-05T12:30:00Z" },
        ],
        reviewResult: "pass",
        testResult: "pass",
        shipResult: "shipped",
        ...overrides,
    };
}
function pattern(overrides) {
    return {
        pattern_id: `pat-2026-05-05-${String(Math.floor(Math.random() * 900) + 100)}`,
        confidence: 0.6,
        applications: 5,
        successes: 3,
        failures: 2,
        last_triggered: "2026-05-05",
        decay_threshold: 0.5,
        tags: [],
        body: "",
        ...overrides,
    };
}
function episode(overrides) {
    return {
        schema_version: 2,
        skill: "forge-build",
        tier: "standard",
        situation: "situation text",
        lesson: "lesson text",
        outcome: "failure",
        body: "",
        ...overrides,
    };
}
// ---------------------------------------------------------------------------
// buildEpisodeFromSession (Requirement 7.9)
// ---------------------------------------------------------------------------
describe("buildEpisodeFromSession — Requirement 7.9", () => {
    it("produces a schema_version=2 episode that serialises with the full frontmatter", () => {
        const ep = buildEpisodeFromSession(META, phaseHistory(), "situation", "lesson", 1);
        expect(ep.schema_version).toBe(2);
        expect(ep.id).toBe("ep-2026-05-05-001");
        expect(ep.date).toBe("2026-05-05");
        expect(ep.tier).toBe("full");
        expect(ep.outcome).toBe("success");
        const serialised = renderEpisode(ep);
        expect(serialised).toContain("schema_version: 2");
        expect(serialised).toContain("id: ep-2026-05-05-001");
        expect(serialised).toContain("outcome: success");
    });
    it("infers outcome=success when ship succeeded", () => {
        const ep = buildEpisodeFromSession(META, phaseHistory({ shipResult: "shipped" }), "s", "l", 1);
        expect(ep.outcome).toBe("success");
    });
    it("infers outcome=partial when ship was blocked", () => {
        const ep = buildEpisodeFromSession(META, phaseHistory({ shipResult: "blocked", reviewResult: "pass", testResult: "pass" }), "s", "l", 2);
        expect(ep.outcome).toBe("partial");
    });
    it("infers outcome=partial when tests fail (even without a ship signal)", () => {
        const ep = buildEpisodeFromSession(META, phaseHistory({ shipResult: undefined, testResult: "fail" }), "s", "l", 3);
        expect(ep.outcome).toBe("partial");
    });
    it("infers outcome=failure when review fails with no recovery", () => {
        const ep = buildEpisodeFromSession(META, {
            phases: [
                { phase: "spec", at: "t" },
                { phase: "build", at: "t" },
                { phase: "review", at: "t" },
            ],
            reviewResult: "fail",
        }, "s", "l", 4);
        expect(ep.outcome).toBe("failure");
    });
    it("skips `learn` and `completed` when attributing a skill and prefixes with forge-", () => {
        const ep = buildEpisodeFromSession(META, {
            phases: [
                { phase: "spec", at: "t" },
                { phase: "build", at: "t" },
                { phase: "ship", at: "t" },
                { phase: "learn", at: "t" },
                { phase: "completed", at: "t" },
            ],
            shipResult: "shipped",
        }, "s", "l", 5);
        expect(ep.skill).toBe("forge-ship");
    });
    it("preserves explicit forge- prefixes in phase names", () => {
        const ep = buildEpisodeFromSession(META, {
            phases: [{ phase: "forge-debug", at: "t" }],
            shipResult: "shipped",
        }, "s", "l", 6);
        expect(ep.skill).toBe("forge-debug");
    });
    it("falls back to forge-learn when the phase history has nothing attributable", () => {
        const ep = buildEpisodeFromSession(META, {
            phases: [
                { phase: "learn", at: "t" },
                { phase: "completed", at: "t" },
            ],
        }, "s", "l", 7);
        expect(ep.skill).toBe("forge-learn");
    });
    it("is pure: the same inputs always yield the same episode", () => {
        const first = buildEpisodeFromSession(META, phaseHistory(), "s", "l", 9);
        const second = buildEpisodeFromSession(META, phaseHistory(), "s", "l", 9);
        expect(second).toEqual(first);
    });
});
// ---------------------------------------------------------------------------
// archivePatternByName (Requirements 7.10, 7.14)
// ---------------------------------------------------------------------------
describe("archivePatternByName — Requirements 7.10, 7.14", () => {
    it("moves the named pattern into archived and leaves the rest active", () => {
        const patterns = [
            pattern({ name: "Retry backoff" }),
            pattern({ name: "Stale reference check" }),
            pattern({ name: "Inline regex literal" }),
        ];
        const result = archivePatternByName(patterns, "Stale reference check");
        expect(result.archived.map((p) => p.name)).toEqual(["Stale reference check"]);
        expect(result.active.map((p) => p.name)).toEqual(["Retry backoff", "Inline regex literal"]);
    });
    it("does not lose entries: active + archived covers every input pattern", () => {
        const patterns = [pattern({ name: "A" }), pattern({ name: "B" }), pattern({ name: "C" })];
        const result = archivePatternByName(patterns, "B");
        const byName = (p) => p.name;
        expect([...result.active, ...result.archived].map(byName).sort()).toEqual(patterns.map(byName).sort());
    });
    it("matches case-insensitively so user confirmation uses natural casing", () => {
        const patterns = [pattern({ name: "Retry Backoff" })];
        const result = archivePatternByName(patterns, "retry backoff");
        expect(result.archived).toHaveLength(1);
        expect(result.archived[0].name).toBe("Retry Backoff");
    });
    it("returns everything active when the name does not match any pattern", () => {
        const patterns = [pattern({ name: "A" }), pattern({ name: "B" })];
        const result = archivePatternByName(patterns, "does-not-exist");
        expect(result.active).toEqual(patterns);
        expect(result.archived).toEqual([]);
    });
    it("is a no-op when the supplied name is empty", () => {
        const patterns = [pattern({ name: "A" })];
        const result = archivePatternByName(patterns, "   ");
        expect(result.active).toEqual(patterns);
        expect(result.archived).toEqual([]);
    });
    it("never mutates the input array", () => {
        const patterns = [pattern({ name: "A" }), pattern({ name: "B" })];
        const snapshot = [...patterns];
        archivePatternByName(patterns, "A");
        expect(patterns).toEqual(snapshot);
    });
});
// ---------------------------------------------------------------------------
// buildPatternUpgradeDrafts (Requirement 7.11)
// ---------------------------------------------------------------------------
describe("buildPatternUpgradeDrafts — Requirement 7.11", () => {
    const NOW = new Date("2026-05-05T00:00:00Z");
    it("returns drafts when 3+ episodes share the same skill + root cause", () => {
        const episodes = [
            episode({
                id: "ep-2026-04-20-001",
                date: "2026-04-20",
                skill: "forge-build",
                root_cause: "stale reference in doc",
                lesson: "grep before commit",
            }),
            episode({
                id: "ep-2026-04-28-002",
                date: "2026-04-28",
                skill: "forge-build",
                root_cause: "stale reference in doc",
                lesson: "grep before commit",
            }),
            episode({
                id: "ep-2026-05-02-003",
                date: "2026-05-02",
                skill: "forge-build",
                root_cause: "stale reference in doc",
                lesson: "grep before commit",
            }),
        ];
        const drafts = buildPatternUpgradeDrafts(episodes, [], NOW);
        expect(drafts).toHaveLength(1);
        const [draft] = drafts;
        expect(draft.sourceEpisodes).toHaveLength(3);
        expect(draft.draft.pattern_id).toMatch(/^pat-2026-05-05-\d{3}$/);
        expect(draft.draft.confidence).toBeCloseTo(0.5, 5); // Beta(2,2) prior mean
        expect(draft.draft.applications).toBe(0);
        expect(draft.draft.decay_threshold).toBe(0.5);
        expect(draft.draft.last_triggered).toBe("2026-05-05");
        expect(draft.draft.tags).toContain("forge-build");
    });
    it("returns no drafts when there is no recurring cluster above the threshold", () => {
        const episodes = [
            episode({
                id: "ep-2026-05-01-001",
                date: "2026-05-01",
                skill: "forge-build",
                root_cause: "unique cause A",
            }),
            episode({
                id: "ep-2026-05-02-002",
                date: "2026-05-02",
                skill: "forge-build",
                root_cause: "unique cause B",
            }),
        ];
        const drafts = buildPatternUpgradeDrafts(episodes, [], NOW);
        expect(drafts).toEqual([]);
    });
    it("assigns deterministic pattern ids based on the suggestion order", () => {
        const mk = (skill, rootCause, id, date) => episode({ id, date, skill, root_cause: rootCause, lesson: "l" });
        const episodes = [
            // Cluster A: 4 episodes (stronger signal, appears first in output)
            mk("forge-review", "missing test case", "ep-2026-04-18-001", "2026-04-18"),
            mk("forge-review", "missing test case", "ep-2026-04-22-002", "2026-04-22"),
            mk("forge-review", "missing test case", "ep-2026-04-26-003", "2026-04-26"),
            mk("forge-review", "missing test case", "ep-2026-05-01-004", "2026-05-01"),
            // Cluster B: 3 episodes
            mk("forge-build", "async race condition", "ep-2026-04-19-001", "2026-04-19"),
            mk("forge-build", "async race condition", "ep-2026-04-23-002", "2026-04-23"),
            mk("forge-build", "async race condition", "ep-2026-04-27-003", "2026-04-27"),
        ];
        const drafts = buildPatternUpgradeDrafts(episodes, [], NOW);
        expect(drafts).toHaveLength(2);
        expect(drafts[0].draft.pattern_id).toBe("pat-2026-05-05-001");
        expect(drafts[1].draft.pattern_id).toBe("pat-2026-05-05-002");
        expect(drafts[0].sourceEpisodes.length).toBeGreaterThanOrEqual(drafts[1].sourceEpisodes.length);
    });
    it("is deterministic for the same inputs", () => {
        const episodes = [
            episode({
                id: "ep-2026-04-20-001",
                date: "2026-04-20",
                skill: "forge-build",
                root_cause: "stale reference",
            }),
            episode({
                id: "ep-2026-04-28-002",
                date: "2026-04-28",
                skill: "forge-build",
                root_cause: "stale reference",
            }),
            episode({
                id: "ep-2026-05-02-003",
                date: "2026-05-02",
                skill: "forge-build",
                root_cause: "stale reference",
            }),
        ];
        const first = buildPatternUpgradeDrafts(episodes, [], NOW);
        const second = buildPatternUpgradeDrafts(episodes, [], NOW);
        expect(second).toEqual(first);
    });
});
// ---------------------------------------------------------------------------
// getLearnPromptConfig (Requirement 7.15)
// ---------------------------------------------------------------------------
describe("getLearnPromptConfig — Requirement 7.15", () => {
    it("never forces a numeric rating regardless of outcome", () => {
        for (const outcome of ["success", "partial", "failure"]) {
            expect(getLearnPromptConfig(outcome).requireUserRating).toBe(false);
        }
    });
    it("skips the failure reason prompt for success and partial outcomes", () => {
        expect(getLearnPromptConfig("success").requireFailureReason).toBe(false);
        expect(getLearnPromptConfig("partial").requireFailureReason).toBe(false);
    });
    it("requires a short failure reason only when the outcome is failure", () => {
        expect(getLearnPromptConfig("failure").requireFailureReason).toBe(true);
    });
    it("echoes the outcome back so the UI knows which prompt to show", () => {
        expect(getLearnPromptConfig("success").outcome).toBe("success");
        expect(getLearnPromptConfig("partial").outcome).toBe("partial");
        expect(getLearnPromptConfig("failure").outcome).toBe("failure");
    });
});
//# sourceMappingURL=learn-episode-integration.test.js.map