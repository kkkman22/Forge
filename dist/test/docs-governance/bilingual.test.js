import { describe, expect, it } from "vitest";
import { checkBilingualPairs, pairBilingual } from "../../src/docs-governance/bilingual.js";
// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
let pathCounter = 0;
function p(s) {
    return s;
}
const DEFAULT_FM = {
    title: "Test",
    category: "getting-started",
    audience: ["new-user"],
    updated: "2026-05-01",
    owner: "Team",
};
function makeDoc(path, fmOverrides) {
    const fm = { ...DEFAULT_FM, ...fmOverrides };
    return {
        path: p(path),
        domain: "A",
        frontmatter: fm,
        bodyHash: `hash${++pathCounter}`,
    };
}
// ─────────────────────────────────────────────────────────────
// pairBilingual
// ─────────────────────────────────────────────────────────────
describe("pairBilingual", () => {
    it("pairs .md and .en.md by slug in same directory", () => {
        const docs = [makeDoc("docs/guide.md"), makeDoc("docs/guide.en.md")];
        const pairs = pairBilingual(docs);
        expect(pairs).toHaveLength(1);
        expect(pairs[0].state).toBe("paired");
        expect(pairs[0].slug).toBe("guide");
        expect(pairs[0].cn).toBeDefined();
        expect(pairs[0].en).toBeDefined();
        expect(pairs[0].cn.path).toBe(p("docs/guide.md"));
        expect(pairs[0].en.path).toBe(p("docs/guide.en.md"));
    });
    it("marks cn-only when .md exists without .en.md", () => {
        const docs = [makeDoc("docs/intro.md")];
        const pairs = pairBilingual(docs);
        expect(pairs).toHaveLength(1);
        expect(pairs[0].state).toBe("cn-only");
        expect(pairs[0].cn).toBeDefined();
        expect(pairs[0].en).toBeUndefined();
    });
    it("marks en-only when .en.md exists without .md", () => {
        const docs = [makeDoc("docs/faq.en.md")];
        const pairs = pairBilingual(docs);
        expect(pairs).toHaveLength(1);
        expect(pairs[0].state).toBe("en-only");
        expect(pairs[0].cn).toBeUndefined();
        expect(pairs[0].en).toBeDefined();
    });
    it("marks orphan_mirror when EN has mirror_of but CN counterpart is missing", () => {
        const docs = [makeDoc("other/guide.en.md", { mirror_of: "guide.md" })];
        const pairs = pairBilingual(docs);
        expect(pairs).toHaveLength(1);
        expect(pairs[0].state).toBe("orphan_mirror");
        expect(pairs[0].en).toBeDefined();
        expect(pairs[0].cn).toBeUndefined();
    });
    it("does not pair files with same slug from different directories", () => {
        const docs = [makeDoc("docs/guide.md"), makeDoc("api/guide.en.md")];
        const pairs = pairBilingual(docs);
        expect(pairs).toHaveLength(2);
        const states = pairs.map((pair) => pair.state).sort();
        expect(states).toEqual(["cn-only", "en-only"]);
    });
    it("handles multiple pairs in same directory", () => {
        const docs = [
            makeDoc("docs/intro.md"),
            makeDoc("docs/intro.en.md"),
            makeDoc("docs/setup.md"),
            makeDoc("docs/setup.en.md"),
        ];
        const pairs = pairBilingual(docs);
        expect(pairs).toHaveLength(2);
        expect(pairs.every((pair) => pair.state === "paired")).toBe(true);
    });
    it("returns empty array for empty input", () => {
        expect(pairBilingual([])).toEqual([]);
    });
});
// ─────────────────────────────────────────────────────────────
// checkBilingualPairs — mirror_of validation
// ─────────────────────────────────────────────────────────────
describe("checkBilingualPairs — mirror_of validation", () => {
    it("errors when mirror_of is not a relative path (has leading /)", () => {
        const docs = [
            makeDoc("docs/guide.md"),
            makeDoc("docs/guide.en.md", { mirror_of: "/absolute/path.md" }),
        ];
        const pairs = pairBilingual(docs);
        const diagnostics = checkBilingualPairs(pairs);
        const mirrorErrors = diagnostics.filter((d) => d.message.includes("mirror_of") && d.severity === "error");
        expect(mirrorErrors.length).toBeGreaterThan(0);
    });
    it("errors when mirror_of does not point to CN counterpart", () => {
        const docs = [
            makeDoc("docs/guide.md"),
            makeDoc("docs/guide.en.md", { mirror_of: "other-file.md" }),
        ];
        const pairs = pairBilingual(docs);
        const diagnostics = checkBilingualPairs(pairs);
        const mismatchErrors = diagnostics.filter((d) => d.message.includes("mirror_of") && d.severity === "error");
        expect(mismatchErrors.length).toBeGreaterThan(0);
    });
    it("passes when mirror_of correctly points to CN counterpart", () => {
        const docs = [
            makeDoc("docs/guide.md"),
            makeDoc("docs/guide.en.md", { mirror_of: "guide.md" }),
        ];
        const pairs = pairBilingual(docs);
        const diagnostics = checkBilingualPairs(pairs);
        const mirrorErrors = diagnostics.filter((d) => d.message.includes("mirror_of") && d.severity === "error");
        expect(mirrorErrors).toHaveLength(0);
    });
});
// ─────────────────────────────────────────────────────────────
// checkBilingualPairs — category/audience consistency (R12.8)
// ─────────────────────────────────────────────────────────────
describe("checkBilingualPairs — category/audience consistency", () => {
    it("errors when category differs between CN and EN", () => {
        const docs = [
            makeDoc("docs/guide.md", { category: "getting-started" }),
            makeDoc("docs/guide.en.md", { category: "advanced", mirror_of: "guide.md" }),
        ];
        const pairs = pairBilingual(docs);
        const diagnostics = checkBilingualPairs(pairs);
        const catErrors = diagnostics.filter((d) => d.message.toLowerCase().includes("category") && d.severity === "error");
        expect(catErrors.length).toBeGreaterThan(0);
    });
    it("errors when audience differs between CN and EN", () => {
        const docs = [
            makeDoc("docs/guide.md", {
                category: "getting-started",
                audience: ["new-user"],
            }),
            makeDoc("docs/guide.en.md", {
                category: "getting-started",
                audience: ["advanced-user"],
                mirror_of: "guide.md",
            }),
        ];
        const pairs = pairBilingual(docs);
        const diagnostics = checkBilingualPairs(pairs);
        const audErrors = diagnostics.filter((d) => d.message.toLowerCase().includes("audience") && d.severity === "error");
        expect(audErrors.length).toBeGreaterThan(0);
    });
    it("passes when category and audience match", () => {
        const docs = [
            makeDoc("docs/guide.md", {
                category: "getting-started",
                audience: ["new-user", "daily-developer"],
            }),
            makeDoc("docs/guide.en.md", {
                category: "getting-started",
                audience: ["new-user", "daily-developer"],
                mirror_of: "guide.md",
            }),
        ];
        const pairs = pairBilingual(docs);
        const diagnostics = checkBilingualPairs(pairs);
        const mismatchErrors = diagnostics.filter((d) => (d.message.toLowerCase().includes("category") ||
            d.message.toLowerCase().includes("audience")) &&
            d.severity === "error");
        expect(mismatchErrors).toHaveLength(0);
    });
});
// ─────────────────────────────────────────────────────────────
// checkBilingualPairs — orphan_mirror warning
// ─────────────────────────────────────────────────────────────
describe("checkBilingualPairs — orphan_mirror", () => {
    it("produces warning for orphan_mirror (EN without CN counterpart)", () => {
        const docs = [makeDoc("docs/guide.en.md", { mirror_of: "guide.md" })];
        const pairs = pairBilingual(docs);
        expect(pairs[0].state).toBe("orphan_mirror");
        const diagnostics = checkBilingualPairs(pairs);
        const orphanWarnings = diagnostics.filter((d) => d.severity === "warning" && d.message.toLowerCase().includes("orphan"));
        expect(orphanWarnings.length).toBeGreaterThan(0);
    });
});
// ─────────────────────────────────────────────────────────────
// checkBilingualPairs — mirror_drift
// ─────────────────────────────────────────────────────────────
describe("checkBilingualPairs — mirror_drift", () => {
    it("warns when CN and EN updated dates differ by more than 14 days", () => {
        const docs = [
            makeDoc("docs/guide.md", { updated: "2026-04-20" }),
            makeDoc("docs/guide.en.md", { updated: "2026-05-10", mirror_of: "guide.md" }),
        ];
        const pairs = pairBilingual(docs);
        const diagnostics = checkBilingualPairs(pairs);
        const driftWarnings = diagnostics.filter((d) => d.severity === "warning" && d.message.toLowerCase().includes("drift"));
        expect(driftWarnings.length).toBeGreaterThan(0);
    });
    it("does not warn when dates are within 14 days", () => {
        const docs = [
            makeDoc("docs/guide.md", { updated: "2026-05-01" }),
            makeDoc("docs/guide.en.md", { updated: "2026-05-10", mirror_of: "guide.md" }),
        ];
        const pairs = pairBilingual(docs);
        const diagnostics = checkBilingualPairs(pairs);
        const driftWarnings = diagnostics.filter((d) => d.message.toLowerCase().includes("drift"));
        expect(driftWarnings).toHaveLength(0);
    });
});
// ─────────────────────────────────────────────────────────────
// checkBilingualPairs — no diagnostics for cn-only
// ─────────────────────────────────────────────────────────────
describe("checkBilingualPairs — cn-only produces no diagnostics", () => {
    it("produces no diagnostics for cn-only docs", () => {
        const docs = [makeDoc("docs/solo.md")];
        const pairs = pairBilingual(docs);
        expect(pairs[0].state).toBe("cn-only");
        const diagnostics = checkBilingualPairs(pairs);
        expect(diagnostics).toHaveLength(0);
    });
});
//# sourceMappingURL=bilingual.test.js.map