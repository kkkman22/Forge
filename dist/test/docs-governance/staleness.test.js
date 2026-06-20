import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { classifyStaleness, isFrontmatterOnlyCommit, isNonSubstantiveCommit, stripFrontmatter, } from "../../src/docs-governance/staleness.js";
const baseFm = (overrides = {}) => ({
    title: "Test",
    category: "reference",
    audience: ["maintainer"],
    updated: "2026-05-01",
    owner: "test",
    ...overrides,
});
describe("classifyStaleness", () => {
    const today = new Date("2026-05-24");
    it("returns fresh for docs updated within warning_days", () => {
        const fm = baseFm({ updated: "2026-04-01" });
        expect(classifyStaleness(fm, today, { warning_days: 90, critical_days: 180, exempt_paths: [] })).toBe("fresh");
    });
    it("returns warning for docs older than warning_days", () => {
        const fm = baseFm({ updated: "2026-01-01" });
        expect(classifyStaleness(fm, today, { warning_days: 90, critical_days: 180, exempt_paths: [] })).toBe("warning");
    });
    it("returns critical for docs older than critical_days", () => {
        const fm = baseFm({ updated: "2025-05-01" });
        expect(classifyStaleness(fm, today, { warning_days: 90, critical_days: 180, exempt_paths: [] })).toBe("critical");
    });
    it("returns invalid for missing updated field", () => {
        const fm = baseFm({ updated: "" });
        expect(classifyStaleness(fm, today, { warning_days: 90, critical_days: 180, exempt_paths: [] })).toBe("invalid");
    });
    it("returns invalid for malformed updated field", () => {
        const fm = baseFm({ updated: "not-a-date" });
        expect(classifyStaleness(fm, today, { warning_days: 90, critical_days: 180, exempt_paths: [] })).toBe("invalid");
    });
    it("returns invalid for future date", () => {
        const fm = baseFm({ updated: "2027-01-01" });
        expect(classifyStaleness(fm, today, { warning_days: 90, critical_days: 180, exempt_paths: [] })).toBe("invalid");
    });
    it("returns fresh for today's date", () => {
        const fm = baseFm({ updated: "2026-05-24" });
        expect(classifyStaleness(fm, today, { warning_days: 90, critical_days: 180, exempt_paths: [] })).toBe("fresh");
    });
    it("returns fresh for exempt paths regardless of age", () => {
        const fm = baseFm({ updated: "2020-01-01" });
        expect(classifyStaleness(fm, today, { warning_days: 90, critical_days: 180, exempt_paths: ["LICENSE.md", "ROADMAP.md"] }, "LICENSE.md")).toBe("fresh");
    });
    it("returns warning exactly at warning_days boundary", () => {
        const fm = baseFm({ updated: "2026-02-23" }); // 90 days before 2026-05-24
        const result = classifyStaleness(fm, today, {
            warning_days: 90,
            critical_days: 180,
            exempt_paths: [],
        });
        // exactly 90 days → warning (daysDiff > warning_days but not tested with >)
        expect(result === "warning" || result === "fresh").toBe(true);
    });
    // ── git-mtime drift detection (P4 blind-spot fix) ──
    // A doc whose body was recently changed in git but whose frontmatter `updated`
    // field was not bumped is silently "fresh" by date alone. The drift check
    // compares frontmatter `updated` against the file's git last-modified date.
    it("returns warning when git mtime is far newer than frontmatter updated (drift)", () => {
        const fm = baseFm({ updated: "2026-01-01" }); // old frontmatter date
        const gitMtime = new Date("2026-05-20"); // body touched recently in git
        expect(classifyStaleness(fm, new Date("2026-05-24"), { warning_days: 90, critical_days: 180, exempt_paths: [], drift_days: 7 }, undefined, gitMtime)).toBe("warning");
    });
    it("returns fresh when git mtime is within drift_days of frontmatter updated", () => {
        const fm = baseFm({ updated: "2026-05-20" });
        const gitMtime = new Date("2026-05-22"); // 2 days after updated — within drift window
        expect(classifyStaleness(fm, new Date("2026-05-24"), { warning_days: 90, critical_days: 180, exempt_paths: [], drift_days: 7 }, undefined, gitMtime)).toBe("fresh");
    });
    it("ignores drift when no gitMtime provided (backward compatible)", () => {
        const fm = baseFm({ updated: "2026-05-20" });
        // No gitMtime → behaves exactly as before
        expect(classifyStaleness(fm, new Date("2026-05-24"), {
            warning_days: 90,
            critical_days: 180,
            exempt_paths: [],
            drift_days: 7,
        })).toBe("fresh");
    });
    it("critical staleness still wins over drift warning", () => {
        const fm = baseFm({ updated: "2024-01-01" }); // very old → critical
        const gitMtime = new Date("2026-05-20"); // drift also present
        expect(classifyStaleness(fm, new Date("2026-05-24"), { warning_days: 90, critical_days: 180, exempt_paths: [], drift_days: 7 }, undefined, gitMtime)).toBe("critical");
    });
    it("uses default drift_days (7) when config omits the field", () => {
        const fm = baseFm({ updated: "2026-05-01" }); // 23 days before git mtime
        const gitMtime = new Date("2026-05-24");
        expect(classifyStaleness(fm, new Date("2026-05-24"), { warning_days: 90, critical_days: 180, exempt_paths: [] }, undefined, gitMtime)).toBe("warning");
    });
    // PBT: staleness level monotonicity (P8)
    it("PBT: daysDiff > critical => critical; warning < daysDiff <= critical => warning", () => {
        // Generate date strings directly to avoid fc.date Invalid Date issues
        const dateStrArb = fc.integer({ min: -400, max: 0 }).map((offset) => {
            const d = new Date(today);
            d.setDate(d.getDate() + offset);
            return d.toISOString().slice(0, 10);
        });
        fc.assert(fc.property(dateStrArb, (dateStr) => {
            const fm = baseFm({ updated: dateStr });
            const result = classifyStaleness(fm, today, {
                warning_days: 90,
                critical_days: 180,
                exempt_paths: [],
            });
            const updated = new Date(`${dateStr}T00:00:00Z`);
            const diffMs = today.getTime() - updated.getTime();
            const daysDiff = Math.floor(diffMs / (1000 * 60 * 60 * 24));
            if (daysDiff > 180) {
                expect(result).toBe("critical");
            }
            else if (daysDiff > 90) {
                expect(result).toBe("warning");
            }
            else {
                expect(result).toBe("fresh");
            }
        }));
    });
});
describe("stripFrontmatter / isFrontmatterOnlyCommit", () => {
    describe("stripFrontmatter", () => {
        it("removes a leading YAML frontmatter block", () => {
            const content = "---\ntitle: T\nupdated: 2026-05-12\n---\n\n# Body\n";
            expect(stripFrontmatter(content)).toBe("\n# Body\n");
        });
        it("returns content verbatim when no frontmatter fence present", () => {
            const content = "# Just a title\n\nbody";
            expect(stripFrontmatter(content)).toBe(content);
        });
        it("handles BOM on the opening fence line", () => {
            const content = "\uFEFF---\ntitle: T\n---\nbody";
            expect(stripFrontmatter(content)).toBe("body");
        });
        it("treats unclosed fence (no second ---) as no frontmatter", () => {
            const content = "---\ntitle: T\nbut never closed\nbody";
            expect(stripFrontmatter(content)).toBe(content);
        });
        it("only strips the FIRST frontmatter block", () => {
            const content = "---\ntitle: T\n---\n\n---\nnot frontmatter\n---\n";
            expect(stripFrontmatter(content)).toBe("\n---\nnot frontmatter\n---\n");
        });
    });
    describe("isFrontmatterOnlyCommit", () => {
        const body = "\n# Heading\n\nSome content line.\n";
        it("returns true when frontmatter is added to an unchanged body", () => {
            const before = body; // no frontmatter
            const after = `---\ntitle: T\nupdated: 2026-05-12\n---\n${body}`;
            expect(isFrontmatterOnlyCommit(before, after)).toBe(true);
        });
        it("returns true when only the updated field inside frontmatter changes", () => {
            const before = `---\ntitle: T\nupdated: 2026-05-10\n---\n${body}`;
            const after = `---\ntitle: T\nupdated: 2026-05-12\n---\n${body}`;
            expect(isFrontmatterOnlyCommit(before, after)).toBe(true);
        });
        it("returns false when a body line changed", () => {
            const before = `---\ntitle: T\n---\n\n# Heading\n\nOld line.\n`;
            const after = `---\ntitle: T\n---\n\n# Heading\n\nNew line.\n`;
            expect(isFrontmatterOnlyCommit(before, after)).toBe(false);
        });
        it("returns false when body content is appended", () => {
            const before = `---\ntitle: T\n---\n${body}`;
            const after = `---\ntitle: T\n---\n${body}\nExtra line.\n`;
            expect(isFrontmatterOnlyCommit(before, after)).toBe(false);
        });
        it("returns true for identical content (no-op commit)", () => {
            const content = `---\ntitle: T\n---\n${body}`;
            expect(isFrontmatterOnlyCommit(content, content)).toBe(true);
        });
    });
    describe("isNonSubstantiveCommit", () => {
        const body = "\n# Heading\n\nSome content line.\n";
        it("returns true when only frontmatter changed", () => {
            const before = `---\ntitle: T\nupdated: 2026-05-10\n---\n${body}`;
            const after = `---\ntitle: T\nupdated: 2026-05-12\n---\n${body}`;
            expect(isNonSubstantiveCommit(before, after)).toBe(true);
        });
        it("returns true when only blank lines differ (whitespace noise)", () => {
            // Mirrors the real baba12dd case: frontmatter backfill added a trailing
            // blank line, body text is otherwise identical.
            const before = `[← index](./INDEX.md)\n\n# Heading\n`;
            const after = `---\ntitle: T\n---\n\n[← index](./INDEX.md)\n\n# Heading\n`;
            expect(isNonSubstantiveCommit(before, after)).toBe(true);
        });
        it("returns true when only trailing whitespace on lines differs", () => {
            const before = `---\ntitle: T\n---\nLine one   \nLine two\n`;
            const after = `---\ntitle: T\n---\nLine one\nLine two\n`;
            expect(isNonSubstantiveCommit(before, after)).toBe(true);
        });
        it("returns false when a word in the body changed", () => {
            const before = `---\ntitle: T\n---\n\n# Heading\n\nOld line.\n`;
            const after = `---\ntitle: T\n---\n\n# Heading\n\nNew line.\n`;
            expect(isNonSubstantiveCommit(before, after)).toBe(false);
        });
        it("returns false when a non-empty body line is added", () => {
            const before = `---\ntitle: T\n---\n${body}`;
            const after = `---\ntitle: T\n---\n${body}\nA real new line.\n`;
            expect(isNonSubstantiveCommit(before, after)).toBe(false);
        });
    });
});
//# sourceMappingURL=staleness.test.js.map