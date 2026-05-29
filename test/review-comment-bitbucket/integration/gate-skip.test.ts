import { describe, expect, it, vi } from "vitest";
import { postReviewToBitbucket } from "../../../src/review-comment-bitbucket/post.js";
import type { ResolvedConfig } from "../../../src/review-comment-bitbucket/types.js";

const CONFIG_AUTO: ResolvedConfig = {
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
    create_pr_task: vi.fn().mockResolvedValue({ id: "t-1" }),
    set_pr_task_status: vi.fn().mockResolvedValue(undefined),
    add_comment: vi.fn().mockResolvedValue({ id: "c-1" }),
    set_review_status: vi.fn().mockResolvedValue(undefined),
  };
}

type Scenario = {
  name: string;
  reason: string;
  config: ResolvedConfig;
  ctx: {
    remoteUrl: string | null;
    mcpBaseUrl: string | null;
    mcpConfigured: boolean;
    runId: string;
  };
};

const SCENARIOS: Scenario[] = [
  {
    name: "override=none",
    reason: "platform-disabled-by-config",
    config: { ...CONFIG_AUTO, platform_override: "none" },
    ctx: {
      remoteUrl: "https://bitbucket.org/org/repo",
      mcpBaseUrl: "https://bitbucket.org",
      mcpConfigured: true,
      runId: "r1",
    },
  },
  {
    name: "github URL + auto",
    reason: "platform-not-bitbucket",
    config: CONFIG_AUTO,
    ctx: {
      remoteUrl: "https://github.com/org/repo",
      mcpBaseUrl: "https://bitbucket.org",
      mcpConfigured: true,
      runId: "r2",
    },
  },
  {
    name: "null remoteUrl + auto",
    reason: "platform-not-bitbucket",
    config: CONFIG_AUTO,
    ctx: { remoteUrl: null, mcpBaseUrl: "https://bitbucket.org", mcpConfigured: true, runId: "r3" },
  },
  {
    name: "bitbucket URL + auto + MCP not configured",
    reason: "mcp-not-configured",
    config: CONFIG_AUTO,
    ctx: {
      remoteUrl: "https://bitbucket.org/org/repo",
      mcpBaseUrl: null,
      mcpConfigured: false,
      runId: "r4",
    },
  },
  {
    name: "bitbucket URL + auto + different host",
    reason: "mcp-base-url-mismatch",
    config: CONFIG_AUTO,
    ctx: {
      remoteUrl: "https://bitbucket.org/org/repo",
      mcpBaseUrl: "https://bitbucket-custom.com",
      mcpConfigured: true,
      runId: "r5",
    },
  },
  {
    name: "override=bitbucket + MCP not configured",
    reason: "override-but-mcp-missing",
    config: { ...CONFIG_AUTO, platform_override: "bitbucket" },
    ctx: {
      remoteUrl: "https://bitbucket.org/org/repo",
      mcpBaseUrl: null,
      mcpConfigured: false,
      runId: "r6",
    },
  },
  {
    name: "override=bitbucket + different host",
    reason: "mcp-base-url-mismatch",
    config: { ...CONFIG_AUTO, platform_override: "bitbucket" },
    ctx: {
      remoteUrl: "https://bitbucket.org/org/repo",
      mcpBaseUrl: "https://bitbucket-custom.com",
      mcpConfigured: true,
      runId: "r7",
    },
  },
];

describe("Integration: gate skip scenarios", () => {
  for (const s of SCENARIOS) {
    it(`${s.name} → ${s.reason}`, async () => {
      const bb = mockBitbucketClient();
      const result = await postReviewToBitbucket("test-fixture", "pr-1", s.config, s.ctx, bb, []);

      expect(result.posted).toBe(false);
      if (!result.posted) {
        expect(result.reason).toBe(s.reason);
      }

      // Zero MCP calls
      expect(bb.list_pr_tasks).not.toHaveBeenCalled();
      expect(bb.create_pr_task).not.toHaveBeenCalled();
      expect(bb.add_comment).not.toHaveBeenCalled();
      expect(bb.set_review_status).not.toHaveBeenCalled();
    });
  }

  it("pass path does NOT trigger skip", async () => {
    const bb = mockBitbucketClient();
    const ctx = {
      remoteUrl: "https://bitbucket.org/org/repo",
      mcpBaseUrl: "https://bitbucket.org",
      mcpConfigured: true,
      runId: "r-pass",
    };
    const result = await postReviewToBitbucket("test-fixture", "pr-1", CONFIG_AUTO, ctx, bb, []);
    expect(result.posted).toBe(true);
  });
});
