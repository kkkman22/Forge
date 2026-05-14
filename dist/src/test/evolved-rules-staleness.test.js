import { describe, expect, it } from "vitest";
import { estimateSessionsSince, evaluateStaleness, parseRules, STALE_THRESHOLD_SESSIONS, writeStaleFlagsToFrontmatter, } from "../src/evolved-rules-staleness.js";
describe("parseRules", () => {
    it("parses rules with Last_triggered field", () => {
        const content = `---
rule_count: 2
---

### R1: Implicit Idle

**Content**: ...
**Added**: 2026-05-09
**Confidence**: 0.9
**Last_triggered**: 2026-05-10

### R2: Review Existence

**Content**: ...
**Added**: 2026-05-10
**Last_triggered**: 2026-05-09
`;
        const rules = parseRules(content);
        expect(rules).toHaveLength(2);
        expect(rules[0].id).toBe("R1");
        expect(rules[0].title).toBe("Implicit Idle");
        expect(rules[0].lastTriggered).toBe("2026-05-10");
        expect(rules[0].added).toBe("2026-05-09");
        expect(rules[1].id).toBe("R2");
        expect(rules[1].lastTriggered).toBe("2026-05-09");
    });
    it("returns null for rules missing Last_triggered", () => {
        const content = `### R1: Orphan Rule

**Content**: ...
**Added**: 2026-05-01
`;
        const rules = parseRules(content);
        expect(rules).toHaveLength(1);
        expect(rules[0].lastTriggered).toBeNull();
    });
    it("ignores Retired Rules section", () => {
        const content = `### R1: Active Rule

**Last_triggered**: 2026-05-10

## Retired Rules

### R-retired-1: Old Rule

**Last_triggered**: 2026-01-01
`;
        const rules = parseRules(content);
        expect(rules).toHaveLength(1);
        expect(rules[0].id).toBe("R1");
    });
    it("returns empty array for content without rules", () => {
        expect(parseRules("# Just a header\n\nNo rules here.")).toEqual([]);
    });
});
describe("estimateSessionsSince", () => {
    it("counts directories with mtime after lastTriggered", () => {
        const lastTriggered = "2026-05-01";
        const mtimes = [
            Date.parse("2026-04-28"),
            Date.parse("2026-05-02"),
            Date.parse("2026-05-05"),
            Date.parse("2026-05-10"),
        ];
        expect(estimateSessionsSince(lastTriggered, mtimes)).toBe(3);
    });
    it("returns 0 when no sessions after lastTriggered", () => {
        expect(estimateSessionsSince("2026-05-10", [Date.parse("2026-05-01")])).toBe(0);
    });
    it("returns null for unparseable date", () => {
        expect(estimateSessionsSince("not-a-date", [Date.now()])).toBeNull();
    });
});
describe("evaluateStaleness", () => {
    it("flags rules with sessionsElapsed >= threshold", () => {
        const rules = [
            { id: "R1", title: "Fresh", lastTriggered: "2026-05-10", added: null },
            { id: "R2", title: "Stale", lastTriggered: "2026-04-01", added: null },
        ];
        const now = Date.parse("2026-05-10");
        // Make 5+ sessions after 2026-04-01 (plenty of mtimes)
        const mtimes = Array.from({ length: 10 }, (_, i) => now - i * 60_000);
        const verdicts = evaluateStaleness(rules, mtimes);
        expect(verdicts[0].stale).toBe(false);
        expect(verdicts[1].stale).toBe(true);
        expect(verdicts[1].sessionsElapsed).toBeGreaterThanOrEqual(STALE_THRESHOLD_SESSIONS);
    });
    it("does not flag rules without Last_triggered", () => {
        const rules = [{ id: "R1", title: "Orphan", lastTriggered: null, added: null }];
        const verdicts = evaluateStaleness(rules, [Date.now()]);
        expect(verdicts[0].stale).toBe(false);
        expect(verdicts[0].sessionsElapsed).toBeNull();
    });
    it("handles empty session list", () => {
        const rules = [{ id: "R1", title: "T", lastTriggered: "2026-05-01", added: null }];
        const verdicts = evaluateStaleness(rules, []);
        expect(verdicts[0].sessionsElapsed).toBe(0);
        expect(verdicts[0].stale).toBe(false);
    });
});
describe("writeStaleFlagsToFrontmatter", () => {
    it("adds stale_flags field when rules are stale", () => {
        const fm = `updated: "2026-05-10"
rule_count: 5`;
        const result = writeStaleFlagsToFrontmatter(fm, ["R2", "R3"]);
        expect(result).toContain("stale_flags: [R2, R3]");
        expect(result).toContain("rule_count: 5");
    });
    it("removes stale_flags when no rules are stale", () => {
        const fm = `updated: "2026-05-10"
stale_flags: [R2]
rule_count: 5`;
        const result = writeStaleFlagsToFrontmatter(fm, []);
        expect(result).not.toContain("stale_flags");
        expect(result).toContain("rule_count: 5");
    });
    it("overwrites existing stale_flags without duplication", () => {
        const fm = `updated: "2026-05-10"
stale_flags: [R1]
rule_count: 5`;
        const result = writeStaleFlagsToFrontmatter(fm, ["R2"]);
        expect(result).toMatch(/stale_flags: \[R2\]/);
        expect(result.match(/stale_flags:/g)).toHaveLength(1);
    });
});
//# sourceMappingURL=evolved-rules-staleness.test.js.map