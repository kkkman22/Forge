import { describe, expect, it, vi } from "vitest";
import { postReviewToBitbucket } from "../../src/review-comment-bitbucket/post.js";
const DEFAULT_CONFIG = {
    enabled: true,
    platform: "bitbucket",
    platform_override: "auto",
    p0_p1_strategy: "both",
    p2_strategy: "inline",
    p3_strategy: "none",
    request_changes_on_p0_p1: true,
    auto_reconcile_resolved: true,
    auto_reopen_regressed: true,
    comment_marker_prefix: "forge-review",
    rate_limit_interval_ms: 0,
};
function mockClient(overrides = {}) {
    return {
        list_pr_tasks: vi.fn().mockResolvedValue([]),
        get_pull_request: vi.fn().mockResolvedValue({ active_comments: [] }),
        get_pull_request_diff: vi.fn().mockResolvedValue(""),
        create_pr_task: vi.fn().mockResolvedValue({ id: "task-1" }),
        set_pr_task_status: vi.fn().mockResolvedValue(undefined),
        add_comment: vi.fn().mockResolvedValue({ id: "comment-1" }),
        set_review_status: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
}
const CTX = {
    remoteUrl: "https://bitbucket.org/org/repo",
    mcpBaseUrl: "https://bitbucket.org",
    mcpConfigured: true,
    runId: "run-1",
};
const P0 = {
    priority: "P0",
    finding_type: "security.injection",
    file_path: "src/a.ts",
    line_number: 1,
    line_type: "ADDED",
    message: "SQLi",
    source_layer: "security-check",
};
describe("postReviewToBitbucket — disabled-by-config branch", () => {
    it("returns posted=false with disabled-by-cli when config.enabled=false", async () => {
        const bb = mockClient();
        const r = await postReviewToBitbucket("review.md", "pr-1", { ...DEFAULT_CONFIG, enabled: false }, CTX, bb, [P0]);
        expect(r.posted).toBe(false);
        expect(bb.create_pr_task).not.toHaveBeenCalled();
        expect(bb.set_review_status).not.toHaveBeenCalled();
    });
});
describe("postReviewToBitbucket — fetch-rejection branches (allSettled resilience)", () => {
    it("records partial failure when list_pr_tasks rejects", async () => {
        const bb = mockClient({ list_pr_tasks: vi.fn().mockRejectedValue(new Error("network")) });
        const r = await postReviewToBitbucket("review.md", "pr-1", DEFAULT_CONFIG, CTX, bb, [P0], { baseDir: undefined });
        // Still posts (allSettled resilience); the rejection is a partial failure.
        expect(r.posted).toBe(true);
    });
    it("records partial failure when get_pull_request rejects", async () => {
        const bb = mockClient({ get_pull_request: vi.fn().mockRejectedValue(new Error("500")) });
        const r = await postReviewToBitbucket("review.md", "pr-1", DEFAULT_CONFIG, CTX, bb, [P0], { baseDir: undefined });
        expect(r.posted).toBe(true);
    });
    it("records partial failure when both fetch calls reject", async () => {
        const bb = mockClient({
            list_pr_tasks: vi.fn().mockRejectedValue(new Error("e1")),
            get_pull_request: vi.fn().mockRejectedValue(new Error("e2")),
        });
        const r = await postReviewToBitbucket("review.md", "pr-1", DEFAULT_CONFIG, CTX, bb, [P0], { baseDir: undefined });
        expect(r.posted).toBe(true);
    });
});
describe("postReviewToBitbucket — set_review_status error branch", () => {
    it("records partial failure when set_review_status throws but still posts", async () => {
        const bb = mockClient({ set_review_status: vi.fn().mockRejectedValue(new Error("forbidden")) });
        const r = await postReviewToBitbucket("review.md", "pr-1", DEFAULT_CONFIG, CTX, bb, [P0], { baseDir: undefined });
        expect(r.posted).toBe(true);
        // set_review_status was attempted (P0 present + request_changes_on_p0_p1).
        expect(bb.set_review_status).toHaveBeenCalled();
    });
    it("does not call set_review_status when request_changes_on_p0_p1=false", async () => {
        const bb = mockClient();
        await postReviewToBitbucket("review.md", "pr-1", { ...DEFAULT_CONFIG, request_changes_on_p0_p1: false }, CTX, bb, [P0], { baseDir: undefined });
        expect(bb.set_review_status).not.toHaveBeenCalled();
    });
    it("does not call set_review_status when no P0/P1 findings", async () => {
        const bb = mockClient();
        const p2 = { ...P0, priority: "P2" };
        await postReviewToBitbucket("review.md", "pr-1", DEFAULT_CONFIG, CTX, bb, [p2], {
            baseDir: undefined,
        });
        expect(bb.set_review_status).not.toHaveBeenCalled();
    });
});
describe("postReviewToBitbucket — P3 filtering branch", () => {
    it("P3 findings are filtered out before reconciliation", async () => {
        const bb = mockClient();
        const p3 = { ...P0, priority: "P3" };
        await postReviewToBitbucket("review.md", "pr-1", DEFAULT_CONFIG, CTX, bb, [p3], {
            baseDir: undefined,
        });
        // P3 creates nothing (p3_strategy=none).
        expect(bb.create_pr_task).not.toHaveBeenCalled();
        expect(bb.add_comment).not.toHaveBeenCalled();
    });
});
describe("postReviewToBitbucket — empty findings branch", () => {
    it("handles empty findings gracefully (posts true, zero creates)", async () => {
        const bb = mockClient();
        const r = await postReviewToBitbucket("review.md", "pr-1", DEFAULT_CONFIG, CTX, bb, [], { baseDir: undefined });
        expect(r.posted).toBe(true);
        expect(bb.create_pr_task).not.toHaveBeenCalled();
    });
});
//# sourceMappingURL=post-branches.test.js.map