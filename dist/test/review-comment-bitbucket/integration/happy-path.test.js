import { describe, expect, it, vi } from "vitest";
import { computeFindingHash } from "../../../src/review-comment-bitbucket/finding-hash.js";
import { postReviewToBitbucket } from "../../../src/review-comment-bitbucket/post.js";
const CONFIG = {
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
function mockBitbucketClient() {
    return {
        list_pr_tasks: vi.fn().mockResolvedValue([]),
        get_pull_request: vi.fn().mockResolvedValue({ active_comments: [] }),
        get_pull_request_diff: vi.fn().mockResolvedValue(""),
        create_pr_task: vi.fn().mockResolvedValue({ id: "task-new" }),
        set_pr_task_status: vi.fn().mockResolvedValue(undefined),
        add_comment: vi.fn().mockResolvedValue({ id: "comment-new" }),
        set_review_status: vi.fn().mockResolvedValue(undefined),
    };
}
const P0 = {
    priority: "P0",
    finding_type: "security.injection",
    file_path: "src/api.ts",
    line_number: 42,
    line_type: "ADDED",
    message: "SQL injection vulnerability",
    source_layer: "security-check",
};
const P1 = {
    priority: "P1",
    finding_type: "quality.error-handling",
    file_path: "src/handler.ts",
    line_number: 15,
    line_type: "CONTEXT",
    message: "Missing error handling",
    source_layer: "quality-check",
};
const P2 = {
    priority: "P2",
    finding_type: "spec-check.style",
    file_path: "src/utils.ts",
    line_number: 100,
    line_type: "REMOVED",
    message: "Unnecessary style issue",
    source_layer: "spec-check",
};
const P3 = {
    priority: "P3",
    finding_type: "quality.naming",
    file_path: "src/types.ts",
    line_number: 5,
    line_type: "ADDED",
    message: "Variable name too short",
    source_layer: "quality-check",
};
describe("Integration: happy path", () => {
    it("full flow: 1 P0 + 1 P1 + 1 P2 + 1 P3", async () => {
        const bb = mockBitbucketClient();
        const ctx = {
            remoteUrl: "https://bitbucket.org/org/repo",
            mcpBaseUrl: "https://bitbucket.org",
            mcpConfigured: true,
            runId: "run-happy-001",
        };
        const result = await postReviewToBitbucket("test-fixture", "pr-1", CONFIG, ctx, bb, [
            P0,
            P1,
            P2,
            P3,
        ]);
        // Result
        expect(result.posted).toBe(true);
        // Reconcile read
        expect(bb.list_pr_tasks).toHaveBeenCalledTimes(1);
        expect(bb.get_pull_request).toHaveBeenCalledTimes(1);
        // P0: 1 task + 1 comment
        // P1: 1 task + 1 comment
        // P2: 1 comment
        // P3: nothing
        expect(bb.create_pr_task).toHaveBeenCalledTimes(2);
        expect(bb.add_comment).toHaveBeenCalledTimes(3);
        // set_review_status called once
        expect(bb.set_review_status).toHaveBeenCalledTimes(1);
        const statusCall = bb.set_review_status.mock.calls[0][0];
        expect(statusCall.comment).toContain("P0=1");
        expect(statusCall.comment).toContain("P1=1");
        expect(statusCall.comment).toContain("run=run-happy-001");
        // Tool call order: P0/P1 (tasks + comments) → P2 (comment) → set_review_status
        const order = [];
        bb.create_pr_task.mock.calls.forEach(() => order.push("create_pr_task"));
        bb.add_comment.mock.calls.forEach(() => order.push("add_comment"));
        bb.set_review_status.mock.calls.forEach(() => order.push("set_review_status"));
        // P3 doesn't participate
        expect(order).not.toContain("P3");
    });
    it("markers are consistent between task and comment", async () => {
        const bb = mockBitbucketClient();
        const ctx = {
            remoteUrl: "https://bitbucket.org/org/repo",
            mcpBaseUrl: "https://bitbucket.org",
            mcpConfigured: true,
            runId: "run-marker-001",
        };
        await postReviewToBitbucket("test-fixture", "pr-1", CONFIG, ctx, bb, [P0]);
        // Both task and comment should reference the same hash
        const taskText = bb.create_pr_task.mock.calls[0][0].text;
        const commentText = bb.add_comment.mock.calls[0][0].comment_text;
        const hash = computeFindingHash(P0);
        expect(taskText).toContain(hash);
        expect(commentText).toContain(hash);
    });
});
//# sourceMappingURL=happy-path.test.js.map