import { describe, expect, it } from "vitest";
import { parseCommentChannelConfig } from "../../src/review-comment-bitbucket/config.js";
import { computeFindingHash } from "../../src/review-comment-bitbucket/finding-hash.js";
import { formatFinding } from "../../src/review-comment-bitbucket/format.js";
import { reconcile } from "../../src/review-comment-bitbucket/reconcile.js";
function finding(overrides = {}) {
    return {
        priority: "P0",
        finding_type: "security.injection",
        file_path: "src/a.ts",
        line_number: 42,
        line_type: "ADDED",
        message: "SQL injection",
        source_layer: "security-check",
        ...overrides,
    };
}
describe("reconcile (branch coverage)", () => {
    it("creates all-new findings when none exist", () => {
        const plan = reconcile({
            currentFindings: [finding()],
            existingTasks: [],
            existingComments: [],
            autoReconcileResolved: true,
            autoReopenRegressed: true,
        });
        expect(plan.creates.length).toBe(1);
    });
    it("reconciles when matching comment exists", () => {
        const f = finding();
        const hash = computeFindingHash(f);
        const plan = reconcile({
            currentFindings: [f],
            existingTasks: [],
            existingComments: [{ hash, resolved: false, marker: `forge-review:hash=${hash}` }],
            autoReconcileResolved: true,
            autoReopenRegressed: true,
        });
        expect(plan).toBeDefined();
    });
    it("handles empty findings", () => {
        const plan = reconcile({
            currentFindings: [],
            existingTasks: [],
            existingComments: [],
            autoReconcileResolved: false,
            autoReopenRegressed: false,
        });
        expect(plan.creates).toEqual([]);
    });
});
describe("formatFinding (branch coverage)", () => {
    it("formats a P0 finding", () => {
        const r = formatFinding(finding(), "run-1", "forge-review");
        expect(r.comment_text).toContain("P0");
        expect(r.comment_text).toContain("SQL injection");
        expect(r.marker).toContain("forge-review:hash=");
    });
    it("formats a P2 finding", () => {
        expect(formatFinding(finding({ priority: "P2" }), "run-1", "forge-review").comment_text).toContain("P2");
    });
    it("formats a P3 finding", () => {
        expect(formatFinding(finding({ priority: "P3" }), "run-1", "forge-review").comment_text).toContain("P3");
    });
});
describe("parseCommentChannelConfig (branch coverage)", () => {
    it("returns defaults for undefined input", () => {
        expect(parseCommentChannelConfig(undefined)).toBeDefined();
    });
    it("returns defaults for empty object", () => {
        expect(parseCommentChannelConfig({}).platform).toBe("bitbucket");
    });
    it("throws for invalid platform", () => {
        expect(() => parseCommentChannelConfig({ platform: "github" })).toThrow();
    });
    it("throws for invalid p3_strategy", () => {
        expect(() => parseCommentChannelConfig({ p3_strategy: "inline" })).toThrow();
    });
    it("accepts enabled false", () => {
        expect(parseCommentChannelConfig({ enabled: false }).enabled).toBe(false);
    });
    it("accepts rate_limit", () => {
        expect(parseCommentChannelConfig({ rate_limit_interval_ms: 1000 }).rate_limit_interval_ms).toBe(1000);
    });
});
//# sourceMappingURL=reconcile-format-config-branches.test.js.map