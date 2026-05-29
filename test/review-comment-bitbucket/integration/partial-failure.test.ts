import { describe, expect, it, vi } from "vitest";
import type { Finding, ResolvedConfig } from "../../lib/types.js";
import { postReviewToBitbucket } from "../../lib/post.js";
import { computeFindingHash } from "../../lib/finding-hash.js";

const CONFIG: ResolvedConfig = {
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

const P0: Finding = {
  priority: "P0",
  finding_type: "security.injection",
  file_path: "src/api.ts",
  line_number: 42,
  line_type: "ADDED",
  message: "SQL injection",
  source_layer: "security-check",
};

const P1: Finding = {
  priority: "P1",
  finding_type: "quality.error",
  file_path: "src/handler.ts",
  line_number: 15,
  line_type: "CONTEXT",
  message: "Missing error handling",
  source_layer: "quality-check",
};

const P2: Finding = {
  priority: "P2",
  finding_type: "spec-check.style",
  file_path: "src/utils.ts",
  line_number: 100,
  line_type: "REMOVED",
  message: "Style issue",
  source_layer: "spec-check",
};

describe("Integration: partial failure", () => {
  it("one add_comment error does not stop remaining actions", async () => {
    let callCount = 0;
    const bb = {
      list_pr_tasks: vi.fn().mockResolvedValue([]),
      get_pull_request: vi.fn().mockResolvedValue({ active_comments: [] }),
      get_pull_request_diff: vi.fn().mockResolvedValue(""),
      create_pr_task: vi.fn().mockResolvedValue({ id: "t-new" }),
      set_pr_task_status: vi.fn().mockResolvedValue(undefined),
      add_comment: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) throw new Error("rate limited");
        return { id: `c-${callCount}` };
      }),
      set_review_status: vi.fn().mockResolvedValue(undefined),
    };

    const result = await postReviewToBitbucket(
      "test-fixture",
      "pr-1",
      CONFIG,
      { remoteUrl: "https://bitbucket.org/org/repo", mcpBaseUrl: "https://bitbucket.org", mcpConfigured: true, runId: "run-pf-001" },
      bb,
      [P0, P1, P2],
    );

    expect(result.posted).toBe(true);
    if (result.posted) {
      expect(result.partial_failures).toBeDefined();
      expect(result.partial_failures!.length).toBeGreaterThanOrEqual(1);
      const failure = result.partial_failures![0];
      expect(failure.tool_name).toBe("add_comment");
      expect(failure.finding_hash).toBeDefined();
      expect(failure.timestamp).toBeGreaterThan(0);
    }

    // Remaining actions still executed
    expect(bb.create_pr_task).toHaveBeenCalled();
    // set_review_status still called despite partial failures
    expect(bb.set_review_status).toHaveBeenCalledTimes(1);
  });

  it("retryable error (429-style) is NOT retried locally", async () => {
    const bb = {
      list_pr_tasks: vi.fn().mockResolvedValue([]),
      get_pull_request: vi.fn().mockResolvedValue({ active_comments: [] }),
      get_pull_request_diff: vi.fn().mockResolvedValue(""),
      create_pr_task: vi.fn().mockRejectedValue(new Error("429 Too Many Requests")),
      set_pr_task_status: vi.fn().mockResolvedValue(undefined),
      add_comment: vi.fn().mockResolvedValue({ id: "c-1" }),
      set_review_status: vi.fn().mockResolvedValue(undefined),
    };

    const result = await postReviewToBitbucket(
      "test-fixture",
      "pr-1",
      CONFIG,
      { remoteUrl: "https://bitbucket.org/org/repo", mcpBaseUrl: "https://bitbucket.org", mcpConfigured: true, runId: "run-429" },
      bb,
      [P0],
    );

    expect(result.posted).toBe(true);
    // create_pr_task called exactly once (no retry)
    expect(bb.create_pr_task).toHaveBeenCalledTimes(1);
  });

  it("all actions fail still returns posted=true", async () => {
    const bb = {
      list_pr_tasks: vi.fn().mockResolvedValue([]),
      get_pull_request: vi.fn().mockResolvedValue({ active_comments: [] }),
      get_pull_request_diff: vi.fn().mockResolvedValue(""),
      create_pr_task: vi.fn().mockRejectedValue(new Error("fail")),
      set_pr_task_status: vi.fn().mockRejectedValue(new Error("fail")),
      add_comment: vi.fn().mockRejectedValue(new Error("fail")),
      set_review_status: vi.fn().mockRejectedValue(new Error("fail")),
    };

    const result = await postReviewToBitbucket(
      "test-fixture",
      "pr-1",
      CONFIG,
      { remoteUrl: "https://bitbucket.org/org/repo", mcpBaseUrl: "https://bitbucket.org", mcpConfigured: true, runId: "run-all-fail" },
      bb,
      [P0, P1],
    );

    expect(result.posted).toBe(true);
    if (result.posted) {
      expect(result.partial_failures!.length).toBeGreaterThan(0);
    }
  });
});
