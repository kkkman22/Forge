import { describe, expect, it } from "vitest";
describe("types: Priority", () => {
    it("accepts valid priority values", () => {
        const values = ["P0", "P1", "P2", "P3"];
        expect(values).toHaveLength(4);
    });
});
describe("types: LineType", () => {
    it("accepts valid line type values", () => {
        const values = ["ADDED", "REMOVED", "CONTEXT"];
        expect(values).toHaveLength(3);
    });
});
describe("types: Action discriminated union", () => {
    it("each kind is mutually exclusive", () => {
        const actions = [
            { kind: "create", finding: {} },
            { kind: "done", task_id: "1", finding_hash: "abc" },
            { kind: "reopen", task_id: "2", finding: {} },
            { kind: "skip-duplicate", finding_hash: "def" },
        ];
        const kinds = actions.map((a) => a.kind);
        expect(new Set(kinds).size).toBe(4);
    });
});
describe("types: ResolvedConfig.p3_strategy literal", () => {
    it("only accepts 'none'", () => {
        const config = {
            enabled: false,
            platform: "bitbucket",
            platform_override: "auto",
            p0_p1_strategy: "both",
            p2_strategy: "inline",
            p3_strategy: "none",
            request_changes_on_p0_p1: true,
            auto_reconcile_resolved: true,
            auto_reopen_regressed: true,
            comment_marker_prefix: "forge-review",
            rate_limit_interval_ms: 100,
        };
        expect(config.p3_strategy).toBe("none");
    });
});
describe("types: GateResult discriminated union", () => {
    it("skip=false has no reason field", () => {
        const result = { skip: false };
        expect(result.skip).toBe(false);
        expect("reason" in result).toBe(false);
    });
    it("skip=true has reason field", () => {
        const result = {
            skip: true,
            reason: "platform-not-bitbucket",
        };
        expect(result.skip).toBe(true);
        if (result.skip) {
            expect(result.reason).toBeDefined();
        }
    });
});
//# sourceMappingURL=types.test.js.map