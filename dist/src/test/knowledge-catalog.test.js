import { describe, expect, it } from "vitest";
import { buildCatalog, parseEvolvedRulesSummary, parseFailureSummary, parseSolutionFrontmatter, renderCatalog, } from "../src/knowledge-catalog.js";
// ---------------------------------------------------------------------------
// parseSolutionFrontmatter
// ---------------------------------------------------------------------------
describe("parseSolutionFrontmatter", () => {
    it("extracts title, confidence, tags, date from valid frontmatter", () => {
        const content = `---
title: "Ship 交付引擎纯函数模式与陷阱"
tags: ["git-transaction", "pure-function", "regex"]
date: "2026-04-29"
confidence: 0.75
---

## 问题模式
Some body content.
`;
        const result = parseSolutionFrontmatter("ship-delivery-pure-functions", content);
        expect(result).not.toBeNull();
        expect(result.title).toBe("Ship 交付引擎纯函数模式与陷阱");
        expect(result.confidence).toBe(0.75);
        expect(result.tags).toEqual(["git-transaction", "pure-function", "regex"]);
        expect(result.date).toBe("2026-04-29");
        expect(result.topic).toBe("ship-delivery-pure-functions");
    });
    it("returns null for content without frontmatter", () => {
        const content = "# No frontmatter here\n\nJust body.";
        expect(parseSolutionFrontmatter("test", content)).toBeNull();
    });
    it("uses topic as title when title is missing", () => {
        const content = `---
tags: ["a"]
date: "2026-01-01"
confidence: 0.5
---

Body.
`;
        const result = parseSolutionFrontmatter("my-topic", content);
        expect(result.title).toBe("my-topic");
    });
    it("handles malformed confidence gracefully", () => {
        const content = `---
title: "Test"
tags: []
date: "2026-01-01"
confidence: not-a-number
---

Body.
`;
        const result = parseSolutionFrontmatter("test", content);
        expect(result.confidence).toBe(0);
    });
});
// ---------------------------------------------------------------------------
// parseFailureSummary
// ---------------------------------------------------------------------------
describe("parseFailureSummary", () => {
    it("counts H3 headings as failure patterns", () => {
        const content = `---
updated: "2026-04-28"
---

# 已知失败模式

### 模块导入路径在 monorepo 中解析失败

Some content.

### 另一个失败模式

More content.
`;
        const result = parseFailureSummary(content);
        expect(result.patternCount).toBe(2);
        expect(result.lastUpdated).toBe("2026-04-28");
    });
    it("returns zero for empty file", () => {
        const content = `---
updated: "2026-04-28"
---

# 已知失败模式

尚未记录失败模式。
`;
        const result = parseFailureSummary(content);
        expect(result.patternCount).toBe(0);
    });
});
// ---------------------------------------------------------------------------
// parseEvolvedRulesSummary
// ---------------------------------------------------------------------------
describe("parseEvolvedRulesSummary", () => {
    it("counts active and retired rules", () => {
        const content = `---
updated: "2026-05-12"
rule_count: 3
---

# Error-Prevention Rules

### R1: Implicit Idle Is Also a Block

Content here.

### R2: Review 必须对新增文件做验证

Content here.

### R3: Pack/Loader 约定差异

Content here.

---

## Retired Rules

- **R-retired-1**: Forge Phase Auto-Advance
- **R-retired-2**: Plan Tasks Are All Mandatory
`;
        const result = parseEvolvedRulesSummary(content, 1);
        expect(result.activeCount).toBe(3);
        expect(result.retiredCount).toBe(2);
        expect(result.staleCandidates).toBe(1);
    });
    it("handles file with no retired section", () => {
        const content = `### R1: Only Rule

Content.
`;
        const result = parseEvolvedRulesSummary(content);
        expect(result.activeCount).toBe(1);
        expect(result.retiredCount).toBe(0);
    });
});
// ---------------------------------------------------------------------------
// renderCatalog / buildCatalog
// ---------------------------------------------------------------------------
describe("renderCatalog", () => {
    const baseDate = new Date("2026-05-12T00:00:00Z");
    it("renders a minimal catalog for empty knowledge base", () => {
        const input = { generatedAt: baseDate };
        const output = renderCatalog(input);
        expect(output).toContain("# Knowledge Catalog");
        expect(output).toContain("generated: 2026-05-12");
        expect(output).toContain("Instinct patterns");
        expect(output).toContain("Solution docs");
    });
    it("renders totals with limit", () => {
        const input = {
            generatedAt: baseDate,
            patterns: [],
            solutions: [],
            limit: 20,
        };
        const output = renderCatalog(input);
        expect(output).toContain("0 / 20");
    });
    it("renders top solutions sorted by confidence", () => {
        const solutions = [
            { topic: "low", title: "Low", confidence: 0.3, tags: ["a"], date: "2026-01-01" },
            { topic: "high", title: "High", confidence: 0.9, tags: ["b", "c"], date: "2026-02-01" },
            { topic: "mid", title: "Mid", confidence: 0.6, tags: ["a", "b"], date: "2026-03-01" },
        ];
        const input = { generatedAt: baseDate, solutions };
        const output = renderCatalog(input);
        // High should appear before mid and low
        const highIdx = output.indexOf("high");
        const midIdx = output.indexOf("mid");
        const lowIdx = output.indexOf("low");
        expect(highIdx).toBeLessThan(midIdx);
        expect(midIdx).toBeLessThan(lowIdx);
    });
    it("truncates solutions beyond 5", () => {
        const solutions = Array.from({ length: 8 }, (_, i) => ({
            topic: `topic-${String(i)}`,
            title: `Title ${String(i)}`,
            confidence: 0.5 + i * 0.05,
            tags: ["tag"],
            date: "2026-01-01",
        }));
        const input = { generatedAt: baseDate, solutions };
        const output = renderCatalog(input);
        expect(output).toContain("… and 3 more");
    });
    it("renders instinct patterns grouped by tag", () => {
        const patterns = [
            {
                pattern_id: "pat-001",
                name: "Pattern A",
                confidence: 0.8,
                applications: 5,
                successes: 4,
                failures: 1,
                last_triggered: "2026-05-01",
                decay_threshold: 0.5,
                tags: ["security", "git"],
                body: "",
            },
            {
                pattern_id: "pat-002",
                name: "Pattern B",
                confidence: 0.7,
                applications: 3,
                successes: 2,
                failures: 1,
                last_triggered: "2026-05-02",
                decay_threshold: 0.5,
                tags: ["security"],
                body: "",
            },
        ];
        const input = { generatedAt: baseDate, patterns };
        const output = renderCatalog(input);
        expect(output).toContain("security");
        expect(output).toContain("git");
    });
    it("stays under 60 lines", () => {
        const patterns = Array.from({ length: 10 }, (_, i) => ({
            pattern_id: `pat-${String(i).padStart(3, "0")}`,
            name: `Pattern ${String(i)}`,
            confidence: 0.5 + i * 0.04,
            applications: 5,
            successes: 4,
            failures: 1,
            last_triggered: "2026-05-01",
            decay_threshold: 0.5,
            tags: [`tag-${String(i % 3)}`, `tag-${String(i % 5)}`],
            body: "",
        }));
        const solutions = Array.from({ length: 15 }, (_, i) => ({
            topic: `sol-${String(i)}`,
            title: `Solution ${String(i)}`,
            confidence: 0.4 + i * 0.03,
            tags: ["t"],
            date: "2026-01-01",
        }));
        const input = {
            generatedAt: baseDate,
            patterns,
            solutions,
            failures: { patternCount: 3, lastUpdated: "2026-05-10" },
            rules: { activeCount: 7, retiredCount: 4, staleCandidates: 2 },
            limit: 20,
        };
        const output = renderCatalog(input);
        const lineCount = output.split("\n").length;
        expect(lineCount).toBeLessThanOrEqual(60);
    });
    it("buildCatalog is equivalent to renderCatalog", () => {
        const input = { generatedAt: baseDate };
        expect(buildCatalog(input)).toBe(renderCatalog(input));
    });
});
//# sourceMappingURL=knowledge-catalog.test.js.map