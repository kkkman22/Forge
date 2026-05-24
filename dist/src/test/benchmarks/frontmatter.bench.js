/**
 * Frontmatter parsing benchmark.
 *
 * BUDGET: p99 < 1 ms, ops/sec > 20 000 (Requirement 4.2, 4.3)
 */
import { bench, describe } from "vitest";
import { extractListField, extractStringField, parseFrontmatter } from "../../src/frontmatter.js";
const SAMPLE = [
    "---",
    'title: "ADR-0042"',
    "deciders:",
    "  - @maintainer-a",
    "  - @maintainer-b",
    'status: "accepted"',
    'date: "2026-05-06"',
    "---",
    "",
    "## Body",
    "body text",
].join("\n");
describe("frontmatter.parseFrontmatter", () => {
    bench("parse block", () => {
        parseFrontmatter(SAMPLE);
    });
});
describe("frontmatter.extract*", () => {
    const fm = parseFrontmatter(SAMPLE)?.raw ?? "";
    bench("extractStringField", () => {
        extractStringField(fm, "title");
    });
    bench("extractListField", () => {
        extractListField(fm, "deciders");
    });
});
//# sourceMappingURL=frontmatter.bench.js.map