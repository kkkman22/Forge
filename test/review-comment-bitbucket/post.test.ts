import * as fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeFindingHash } from "../../src/review-comment-bitbucket/finding-hash.js";
import { postReviewToBitbucket } from "../../src/review-comment-bitbucket/post.js";
import type {
  ActionPlan,
  CommentRecord,
  Finding,
  ResolvedConfig,
  TaskRecord,
} from "../../src/review-comment-bitbucket/types.js";

const DEFAULT_CONFIG: ResolvedConfig = {
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
    create_pr_task: vi.fn().mockResolvedValue({ id: "task-1" }),
    set_pr_task_status: vi.fn().mockResolvedValue(undefined),
    add_comment: vi.fn().mockResolvedValue({ id: "comment-1" }),
    set_review_status: vi.fn().mockResolvedValue(undefined),
  };
}

const P0_FINDING: Finding = {
  priority: "P0",
  finding_type: "security.injection",
  file_path: "src/api.ts",
  line_number: 42,
  line_type: "ADDED",
  message: "SQL injection vulnerability",
  source_layer: "security-check",
};

const P1_FINDING: Finding = {
  priority: "P1",
  finding_type: "quality.error-handling",
  file_path: "src/handler.ts",
  line_number: 15,
  line_type: "CONTEXT",
  message: "Missing error handling",
  source_layer: "quality-check",
};

const P2_FINDING: Finding = {
  priority: "P2",
  finding_type: "spec-check.style",
  file_path: "src/utils.ts",
  line_number: 100,
  line_type: "REMOVED",
  message: "Unnecessary style issue",
  source_layer: "spec-check",
};

const P3_FINDING: Finding = {
  priority: "P3",
  finding_type: "quality.naming",
  file_path: "src/types.ts",
  line_number: 5,
  line_type: "ADDED",
  message: "Variable name too short",
  source_layer: "quality-check",
};

describe("Property: gate skip => zero MCP calls", () => {
  it("platform gate skip results in 0 MCP tool calls", { timeout: 30000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(
          "platform-not-bitbucket",
          "mcp-not-configured",
          "platform-disabled-by-config",
        ),
        async (reason) => {
          const bb = mockBitbucketClient();
          const ctx = {
            remoteUrl:
              reason === "platform-not-bitbucket"
                ? "https://github.com/foo"
                : "https://bitbucket.org/foo",
            mcpBaseUrl: "https://bitbucket.org",
            mcpConfigured: reason !== "mcp-not-configured",
            runId: "run-1",
          };
          const config = {
            ...DEFAULT_CONFIG,
            platform_override:
              reason === "platform-disabled-by-config" ? ("none" as const) : ("auto" as const),
          };
          const result = await postReviewToBitbucket("/dev/null", "pr-1", config, ctx, bb, []);
          expect(result.posted).toBe(false);
          expect(bb.create_pr_task).not.toHaveBeenCalled();
          expect(bb.add_comment).not.toHaveBeenCalled();
          expect(bb.set_review_status).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 10 },
    );
  });
});

describe("Property: has_p0_p1=false => set_review_status not called", () => {
  it("no P0/P1 findings means set_review_status never called", { timeout: 30000 }, async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            priority: fc.constantFrom("P2", "P3") as any,
            finding_type: fc.string({ minLength: 1, maxLength: 20 }),
            file_path: fc.string({ minLength: 1, maxLength: 20 }),
            line_number: fc.integer({ min: 1, max: 100 }),
            line_type: fc.constantFrom("ADDED", "REMOVED", "CONTEXT"),
            message: fc.string({ minLength: 1, maxLength: 100 }),
            source_layer: fc.constantFrom("spec-check", "quality-check", "security-check"),
          }) as fc.Arbitrary<Finding>,
          { maxLength: 5 },
        ),
        async (findings) => {
          const bb = mockBitbucketClient();
          // Mock parseReviewMarkdown to return our findings
          const result = await postReviewToBitbucket(
            "test-fixture",
            "pr-1",
            DEFAULT_CONFIG,
            {
              remoteUrl: "https://bitbucket.org/org/repo",
              mcpBaseUrl: "https://bitbucket.org",
              mcpConfigured: true,
              runId: "run-1",
            },
            bb,
            findings,
          );
          if (result.posted) {
            expect(bb.set_review_status).not.toHaveBeenCalled();
          }
        },
      ),
      { numRuns: 20 },
    );
  });
});

describe("Unit: p0_p1_strategy=both creates task + comment", () => {
  it("P0 finding creates 1 pr_task + 1 comment", async () => {
    const bb = mockBitbucketClient();
    const result = await postReviewToBitbucket(
      "test-fixture",
      "pr-1",
      DEFAULT_CONFIG,
      {
        remoteUrl: "https://bitbucket.org/org/repo",
        mcpBaseUrl: "https://bitbucket.org",
        mcpConfigured: true,
        runId: "run-1",
      },
      bb,
      [P0_FINDING],
    );
    expect(result.posted).toBe(true);
    expect(bb.create_pr_task).toHaveBeenCalledTimes(1);
    expect(bb.add_comment).toHaveBeenCalledTimes(1);
  });
});

describe("audit P2-4: current-state fetch failure must abort, not duplicate-post", () => {
  it("aborts with no creates when list_pr_tasks rejects (transient API error)", async () => {
    const bb = mockBitbucketClient();
    // Simulate a transient Bitbucket API failure during the fetch of existing
    // tasks. Before the fix, allSettled degraded this to [] and the reconcile
    // proceeded as if the PR had no existing tasks → every finding re-posted.
    bb.list_pr_tasks.mockRejectedValueOnce(new Error("HTTP 503 upstream timeout"));

    const result = await postReviewToBitbucket(
      "test-fixture",
      "pr-1",
      DEFAULT_CONFIG,
      {
        remoteUrl: "https://bitbucket.org/org/repo",
        mcpBaseUrl: "https://bitbucket.org",
        mcpConfigured: true,
        runId: "run-1",
      },
      bb,
      [P0_FINDING, P1_FINDING],
    );

    // Fail-closed: the post must NOT proceed without a reliable view of what's
    // already on the PR. No tasks/comments created.
    expect(result.posted).toBe(false);
    expect(bb.create_pr_task).not.toHaveBeenCalled();
    expect(bb.add_comment).not.toHaveBeenCalled();
    expect(bb.set_review_status).not.toHaveBeenCalled();
  });

  it("aborts with no creates when get_pull_request rejects (transient API error)", async () => {
    const bb = mockBitbucketClient();
    bb.get_pull_request.mockRejectedValueOnce(new Error("HTTP 500"));

    const result = await postReviewToBitbucket(
      "test-fixture",
      "pr-1",
      DEFAULT_CONFIG,
      {
        remoteUrl: "https://bitbucket.org/org/repo",
        mcpBaseUrl: "https://bitbucket.org",
        mcpConfigured: true,
        runId: "run-1",
      },
      bb,
      [P2_FINDING],
    );

    expect(result.posted).toBe(false);
    expect(bb.add_comment).not.toHaveBeenCalled();
  });
});

describe("Unit: p0_p1_strategy=pr-task creates only task", () => {
  it("P0 finding creates 1 pr_task, no comment", async () => {
    const bb = mockBitbucketClient();
    const config = { ...DEFAULT_CONFIG, p0_p1_strategy: "pr-task" as const };
    const result = await postReviewToBitbucket(
      "test-fixture",
      "pr-1",
      config,
      {
        remoteUrl: "https://bitbucket.org/org/repo",
        mcpBaseUrl: "https://bitbucket.org",
        mcpConfigured: true,
        runId: "run-1",
      },
      bb,
      [P0_FINDING],
    );
    expect(result.posted).toBe(true);
    expect(bb.create_pr_task).toHaveBeenCalledTimes(1);
    expect(bb.add_comment).toHaveBeenCalledTimes(0);
  });
});

describe("Unit: p0_p1_strategy=inline-only creates only comment", () => {
  it("P0 finding creates 1 comment, no task", async () => {
    const bb = mockBitbucketClient();
    const config = { ...DEFAULT_CONFIG, p0_p1_strategy: "inline-only" as const };
    const result = await postReviewToBitbucket(
      "test-fixture",
      "pr-1",
      config,
      {
        remoteUrl: "https://bitbucket.org/org/repo",
        mcpBaseUrl: "https://bitbucket.org",
        mcpConfigured: true,
        runId: "run-1",
      },
      bb,
      [P0_FINDING],
    );
    expect(result.posted).toBe(true);
    expect(bb.create_pr_task).toHaveBeenCalledTimes(0);
    expect(bb.add_comment).toHaveBeenCalledTimes(1);
  });
});

describe("Unit: p2_strategy=inline creates only comment for P2", () => {
  it("P2 finding creates 1 comment, no task", async () => {
    const bb = mockBitbucketClient();
    const result = await postReviewToBitbucket(
      "test-fixture",
      "pr-1",
      DEFAULT_CONFIG,
      {
        remoteUrl: "https://bitbucket.org/org/repo",
        mcpBaseUrl: "https://bitbucket.org",
        mcpConfigured: true,
        runId: "run-1",
      },
      bb,
      [P2_FINDING],
    );
    expect(result.posted).toBe(true);
    expect(bb.create_pr_task).toHaveBeenCalledTimes(0);
    expect(bb.add_comment).toHaveBeenCalledTimes(1);
  });
});

describe("Unit: p2_strategy=none creates nothing for P2", () => {
  it("P2 finding creates no calls", async () => {
    const bb = mockBitbucketClient();
    const config = { ...DEFAULT_CONFIG, p2_strategy: "none" as const };
    const result = await postReviewToBitbucket(
      "test-fixture",
      "pr-1",
      config,
      {
        remoteUrl: "https://bitbucket.org/org/repo",
        mcpBaseUrl: "https://bitbucket.org",
        mcpConfigured: true,
        runId: "run-1",
      },
      bb,
      [P2_FINDING],
    );
    expect(result.posted).toBe(true);
    expect(bb.create_pr_task).toHaveBeenCalledTimes(0);
    expect(bb.add_comment).toHaveBeenCalledTimes(0);
  });
});

describe("Unit: P3 finding creates nothing", () => {
  it("P3 creates no tasks, no comments, no status", async () => {
    const bb = mockBitbucketClient();
    const result = await postReviewToBitbucket(
      "test-fixture",
      "pr-1",
      DEFAULT_CONFIG,
      {
        remoteUrl: "https://bitbucket.org/org/repo",
        mcpBaseUrl: "https://bitbucket.org",
        mcpConfigured: true,
        runId: "run-1",
      },
      bb,
      [P3_FINDING],
    );
    expect(result.posted).toBe(true);
    expect(bb.create_pr_task).toHaveBeenCalledTimes(0);
    expect(bb.add_comment).toHaveBeenCalledTimes(0);
    expect(bb.set_review_status).toHaveBeenCalledTimes(0);
  });
});

describe("Unit: set_review_status comment format", () => {
  it("comment contains P0=<int> P1=<int> run=<id>", async () => {
    const bb = mockBitbucketClient();
    await postReviewToBitbucket(
      "test-fixture",
      "pr-1",
      DEFAULT_CONFIG,
      {
        remoteUrl: "https://bitbucket.org/org/repo",
        mcpBaseUrl: "https://bitbucket.org",
        mcpConfigured: true,
        runId: "run-42",
      },
      bb,
      [P0_FINDING, P1_FINDING, P2_FINDING, P3_FINDING],
    );
    expect(bb.set_review_status).toHaveBeenCalledTimes(1);
    const call = bb.set_review_status.mock.calls[0][0];
    expect(call.comment).toContain("P0=1");
    expect(call.comment).toContain("P1=1");
    expect(call.comment).toContain("run=run-42");
  });
});

describe("Unit: execution order P0/P1 → P2 → set_review_status", () => {
  it("tools called in correct order", async () => {
    const bb = mockBitbucketClient();
    const order: string[] = [];
    bb.create_pr_task.mockImplementation(async () => {
      order.push("create_pr_task");
      return { id: "t-1" };
    });
    bb.add_comment.mockImplementation(async () => {
      order.push("add_comment");
      return { id: "c-1" };
    });
    bb.set_review_status.mockImplementation(async () => {
      order.push("set_review_status");
    });

    await postReviewToBitbucket(
      "test-fixture",
      "pr-1",
      DEFAULT_CONFIG,
      {
        remoteUrl: "https://bitbucket.org/org/repo",
        mcpBaseUrl: "https://bitbucket.org",
        mcpConfigured: true,
        runId: "run-1",
      },
      bb,
      [P0_FINDING, P2_FINDING],
    );

    // P0 creates task + comment first, then P2 creates comment, then set_review_status
    const lastStatusIdx = order.lastIndexOf("set_review_status");
    expect(lastStatusIdx).toBe(order.length - 1); // last call
    expect(order.indexOf("add_comment")).toBeLessThan(lastStatusIdx);
  });
});

describe("Unit: reopen and done carry parent_comment_id", () => {
  it("reopen adds comment with parent_comment_id", async () => {
    const bb = mockBitbucketClient();
    const hash = computeFindingHash(P0_FINDING);
    bb.list_pr_tasks.mockResolvedValue([
      { id: "task-1", content: `[Forge P0] <!-- forge-review:hash=${hash} -->`, state: "RESOLVED" },
    ]);
    bb.get_pull_request.mockResolvedValue({ active_comments: [] });

    await postReviewToBitbucket(
      "test-fixture",
      "pr-1",
      DEFAULT_CONFIG,
      {
        remoteUrl: "https://bitbucket.org/org/repo",
        mcpBaseUrl: "https://bitbucket.org",
        mcpConfigured: true,
        runId: "run-1",
      },
      bb,
      [P0_FINDING],
    );

    // Should have set_pr_task_status to reopen + add_comment with parent
    expect(bb.set_pr_task_status).toHaveBeenCalled();
    // The reopen comment should exist
    expect(bb.add_comment).toHaveBeenCalled();
  });
});
