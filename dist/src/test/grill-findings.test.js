/**
 * Unit tests for the Task 4.3 additions to `src/grill.ts`:
 *   - `extractNewGlossaryCandidates` — picks up new TitleCase /
 *     PascalCase / CJK terms the user introduced during a grill
 *     session, while skipping anything already defined in the
 *     glossary.
 *   - `renderGrillFindings` — produces the canonical
 *     `findings/grill-<topic>.md` body with four fixed sections.
 *
 * **Validates: Requirements 4.5, 4.7**
 */
import { describe, expect, it } from "vitest";
import { applyAnswer, extractNewGlossaryCandidates, generateDecisionTree, renderGrillFindings, } from "../src/grill.js";
// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const FIXED_NOW = new Date("2026-05-05T12:00:00Z");
const EMPTY_GLOSSARY = {
    schema_version: 1,
    updated: "2026-05-05",
    terms: [],
};
const GLOSSARY_WITH_SPEC = {
    schema_version: 1,
    updated: "2026-05-05",
    terms: [
        { term: "Spec", definition: "Locked-in requirement.", last_updated: "2026-05-05" },
        {
            term: "Tier",
            definition: "Complexity dimension.",
            aliases: ["档位"],
            last_updated: "2026-05-05",
        },
        {
            term: "Event Sourcing",
            definition: "Persistence style that records all state changes as an append-only log.",
            last_updated: "2026-05-05",
        },
    ],
};
/**
 * Build a fully-resolved grill tree with user answers that introduce
 * new TitleCase / PascalCase terms alongside a glossary-known one.
 *
 * The answers are chosen so that `Event Sourcing` and `EventSourcing`
 * occur at least twice — reaching the default `minFrequency=2` — while
 * `Spec` is already defined in `GLOSSARY_WITH_SPEC` and so must be
 * filtered out.
 */
function buildResolvedTree(glossary) {
    const base = generateDecisionTree("Lock the spec for a new Event Sourcing pipeline.", glossary, FIXED_NOW);
    const withFunctionality = applyAnswer(base, "functionality-1", "We use Event Sourcing to persist audit trails. Event Sourcing keeps history.", FIXED_NOW);
    const withBoundary = applyAnswer(withFunctionality, "boundary-1", "Out of scope: EventSourcing replay tooling and EventSourcing projections.", FIXED_NOW);
    return withBoundary;
}
/** Walk the tree and collect all node IDs in pre-order. */
function collectAllIds(tree) {
    const out = [];
    const visit = (node) => {
        out.push(node.id);
        for (const child of node.children)
            visit(child);
    };
    for (const root of tree.nodes)
        visit(root);
    return out;
}
// ---------------------------------------------------------------------------
// extractNewGlossaryCandidates
// ---------------------------------------------------------------------------
describe("extractNewGlossaryCandidates", () => {
    it("picks up TitleCase phrases that appeared in userAnswer", () => {
        const tree = buildResolvedTree(EMPTY_GLOSSARY);
        const candidates = extractNewGlossaryCandidates(tree, EMPTY_GLOSSARY);
        const terms = candidates.map((c) => c.term.toLowerCase());
        expect(terms).toContain("event sourcing");
    });
    it("skips terms already present in the glossary (canonical name)", () => {
        const tree = buildResolvedTree(GLOSSARY_WITH_SPEC);
        const candidates = extractNewGlossaryCandidates(tree, GLOSSARY_WITH_SPEC);
        // `Event Sourcing` is glossary-known → must not surface as a candidate.
        const terms = candidates.map((c) => c.term.toLowerCase());
        expect(terms).not.toContain("event sourcing");
    });
    it("skips glossary aliases too", () => {
        const treeText = generateDecisionTree("We need 档位 routing for 档位 rules.", GLOSSARY_WITH_SPEC, FIXED_NOW);
        const candidates = extractNewGlossaryCandidates(treeText, GLOSSARY_WITH_SPEC);
        const terms = candidates.map((c) => c.term);
        expect(terms).not.toContain("档位");
    });
    it("returns an empty list when the tree text has no candidate terms", () => {
        const bland = generateDecisionTree("do stuff", EMPTY_GLOSSARY, FIXED_NOW);
        const candidates = extractNewGlossaryCandidates(bland, EMPTY_GLOSSARY);
        expect(candidates).toEqual([]);
    });
    it("is pure: does not mutate the input tree", () => {
        const tree = buildResolvedTree(GLOSSARY_WITH_SPEC);
        const snapshot = JSON.stringify(tree);
        extractNewGlossaryCandidates(tree, GLOSSARY_WITH_SPEC);
        expect(JSON.stringify(tree)).toBe(snapshot);
    });
});
// ---------------------------------------------------------------------------
// renderGrillFindings
// ---------------------------------------------------------------------------
describe("renderGrillFindings", () => {
    it("contains all four required section headers in order", () => {
        const tree = buildResolvedTree(EMPTY_GLOSSARY);
        const output = renderGrillFindings(tree, "Agreed on Event Sourcing for audit.");
        const decisionIdx = output.indexOf("## Decision Tree");
        const qaIdx = output.indexOf("## Q&A Pairs");
        const summaryIdx = output.indexOf("## Alignment Summary");
        const candidatesIdx = output.indexOf("## New Glossary Candidates");
        expect(decisionIdx).toBeGreaterThan(-1);
        expect(qaIdx).toBeGreaterThan(decisionIdx);
        expect(summaryIdx).toBeGreaterThan(qaIdx);
        expect(candidatesIdx).toBeGreaterThan(summaryIdx);
    });
    it("uses the first non-empty line of rootDescription as the H1 title", () => {
        const tree = buildResolvedTree(EMPTY_GLOSSARY);
        const output = renderGrillFindings(tree, "");
        expect(output.startsWith("# Grill Findings: Lock the spec for a new Event Sourcing pipeline.")).toBe(true);
    });
    it("renders the decision tree as a nested bullet list including status", () => {
        const tree = buildResolvedTree(EMPTY_GLOSSARY);
        const output = renderGrillFindings(tree, "summary");
        // Every root's status line must appear.
        expect(output).toContain("- [RESOLVED] functionality/functionality-1:");
        expect(output).toContain("- [RESOLVED] boundary/boundary-1:");
        expect(output).toContain("- [PENDING] dependency/dependency-1:");
        // Answers are indented under the resolved node.
        expect(output).toContain("  Answer: We use Event Sourcing to persist audit trails.");
    });
    it("Q&A Pairs section shows only resolved nodes", () => {
        const tree = buildResolvedTree(EMPTY_GLOSSARY);
        const output = renderGrillFindings(tree, "summary");
        const qaSection = extractSection(output, "## Q&A Pairs", "## Alignment Summary");
        // Two resolved roots → two Q&A entries, no pending ones.
        expect(qaSection).toContain("- Q: What are the core user-facing behaviors");
        expect(qaSection).toContain("  A: We use Event Sourcing");
        expect(qaSection).toContain("- Q: What is explicitly out of scope?");
        // Pending dependency root must not appear.
        expect(qaSection).not.toContain("- Q: Which existing modules or external services must this coordinate with?");
    });
    it("shows `none` when no resolved nodes are present", () => {
        const tree = generateDecisionTree("brand new topic", EMPTY_GLOSSARY, FIXED_NOW);
        const output = renderGrillFindings(tree, "initial alignment");
        const qaSection = extractSection(output, "## Q&A Pairs", "## Alignment Summary");
        expect(qaSection.trim()).toBe("none");
    });
    it("emits `none` under New Glossary Candidates when the list is empty", () => {
        // A bland description with no TitleCase / CJK terms produces zero
        // candidates after the default-rule filter.
        const tree = generateDecisionTree("do stuff", EMPTY_GLOSSARY, FIXED_NOW);
        const resolved = collectAllIds(tree).reduce((acc, id) => applyAnswer(acc, id, "lowercase answer only", FIXED_NOW), tree);
        const output = renderGrillFindings(resolved, "nothing notable");
        const candidatesSection = output.slice(output.indexOf("## New Glossary Candidates"));
        // Strip the header + the following blank line.
        const body = candidatesSection.replace(/^## New Glossary Candidates\n+/, "").trim();
        expect(body).toBe("none");
    });
    it("lists candidate terms with frequency when present", () => {
        const tree = buildResolvedTree(EMPTY_GLOSSARY);
        const output = renderGrillFindings(tree, "summary");
        const candidatesSection = output.slice(output.indexOf("## New Glossary Candidates"));
        // At least one bullet line of the form "- <term> (<n>)" must appear.
        expect(candidatesSection).toMatch(/- .+ \(\d+\)/);
    });
    it("includes the alignment summary verbatim", () => {
        const tree = buildResolvedTree(EMPTY_GLOSSARY);
        const summary = "Agreed: use Event Sourcing for audit. Out: replay tooling.";
        const output = renderGrillFindings(tree, summary);
        const summarySection = extractSection(output, "## Alignment Summary", "## New Glossary Candidates");
        expect(summarySection.trim()).toBe(summary);
    });
    it("falls back to `none` for a blank alignment summary", () => {
        const tree = buildResolvedTree(EMPTY_GLOSSARY);
        const output = renderGrillFindings(tree, "   ");
        const summarySection = extractSection(output, "## Alignment Summary", "## New Glossary Candidates");
        expect(summarySection.trim()).toBe("none");
    });
    it("is deterministic for identical inputs", () => {
        const tree = buildResolvedTree(EMPTY_GLOSSARY);
        const a = renderGrillFindings(tree, "same summary");
        const b = renderGrillFindings(tree, "same summary");
        expect(a).toBe(b);
    });
});
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/**
 * Return the substring between two markdown section headers. Used to
 * assert on a single section's body without accidental matches from
 * adjacent sections.
 */
function extractSection(output, start, end) {
    const startIdx = output.indexOf(start);
    const endIdx = output.indexOf(end);
    if (startIdx === -1 || endIdx === -1 || endIdx < startIdx)
        return "";
    return output.slice(startIdx + start.length, endIdx);
}
//# sourceMappingURL=grill-findings.test.js.map