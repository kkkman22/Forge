import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Finding, ResolvedConfig } from "../../lib/types.js";
import { postReviewToBitbucket } from "../../lib/post.js";

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

function mockBitbucketClient() {
  return {
    list_pr_tasks: vi.fn().mockResolvedValue([]),
    get_pull_request: vi.fn().mockResolvedValue({ active_comments: [] }),
    get_pull_request_diff: vi.fn().mockResolvedValue(""),
    create_pr_task: vi.fn().mockResolvedValue({ id: "t-new" }),
    set_pr_task_status: vi.fn().mockResolvedValue(undefined),
    add_comment: vi.fn().mockResolvedValue({ id: "c-new" }),
    set_review_status: vi.fn().mockResolvedValue(undefined),
  };
}

function createTmpForgeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "forge-rcb-"));
  mkdirSync(join(dir, ".forge"), { recursive: true });
  return dir;
}

describe("Integration: post.ts wires side-effect modules", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTmpForgeDir();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("gate skip calls recordSkip → writes daily skip file", async () => {
    const bb = mockBitbucketClient();
    const reviewMd = join(tmpDir, "review.md");
    writeFileSync(reviewMd, "# Review\n", "utf-8");

    const result = await postReviewToBitbucket(
      reviewMd,
      "pr-1",
      { ...CONFIG, platform_override: "none" },
      { remoteUrl: "https://bitbucket.org/org/repo", mcpBaseUrl: "https://bitbucket.org", mcpConfigured: true, runId: "run-skip-001" },
      bb,
      [],
      { baseDir: tmpDir },
    );

    expect(result.posted).toBe(false);
    // recordSkip should have written a daily skip file
    const findingsDir = join(tmpDir, ".forge", "findings");
    expect(existsSync(findingsDir)).toBe(true);
    const files = require("node:fs").readdirSync(findingsDir);
    expect(files.some((f: string) => f.startsWith("comment-channel-skipped-"))).toBe(true);
  });

  it("happy path calls appendRunMetrics → writes metrics.md", async () => {
    const bb = mockBitbucketClient();

    await postReviewToBitbucket(
      join(tmpDir, "review.md"),
      "pr-1",
      CONFIG,
      { remoteUrl: "https://bitbucket.org/org/repo", mcpBaseUrl: "https://bitbucket.org", mcpConfigured: true, runId: "run-metrics-001" },
      bb,
      [P0],
      { baseDir: tmpDir },
    );

    const metricsPath = join(tmpDir, ".forge", "knowledge", "metrics.md");
    expect(existsSync(metricsPath)).toBe(true);
    const content = readFileSync(metricsPath, "utf-8");
    expect(content).toContain("run_id=run-metrics-001");
    expect(content).toContain("creates=1");
  });

  it("partial failures persisted via recordPartialFailures", async () => {
    let callCount = 0;
    const bb = mockBitbucketClient();
    bb.create_pr_task.mockImplementation(async () => {
      callCount++;
      if (callCount === 1) throw new Error("rate limited");
      return { id: "t-new" };
    });

    await postReviewToBitbucket(
      join(tmpDir, "review.md"),
      "pr-1",
      CONFIG,
      { remoteUrl: "https://bitbucket.org/org/repo", mcpBaseUrl: "https://bitbucket.org", mcpConfigured: true, runId: "run-pf-002" },
      bb,
      [P0],
      { baseDir: tmpDir },
    );

    const findingsDir = join(tmpDir, ".forge", "findings");
    expect(existsSync(findingsDir)).toBe(true);
    const files = require("node:fs").readdirSync(findingsDir);
    expect(files.some((f: string) => f.startsWith("comment-channel-error-"))).toBe(true);
  });

  it("parseReviewMarkdown failure returns graceful result, not throws", async () => {
    const bb = mockBitbucketClient();
    const badPath = join(tmpDir, "nonexistent.md");

    const result = await postReviewToBitbucket(
      badPath,
      "pr-1",
      CONFIG,
      { remoteUrl: "https://bitbucket.org/org/repo", mcpBaseUrl: "https://bitbucket.org", mcpConfigured: true, runId: "run-parse-err" },
      bb,
    );

    // Should not throw — should return a result indicating parse failure
    expect(result.posted).toBe(false);
    expect(result.reason).toBe("parse-error");
  });

  it("applyCliOverrides wired: --no-post-comments disables posting", async () => {
    const bb = mockBitbucketClient();

    const result = await postReviewToBitbucket(
      join(tmpDir, "review.md"),
      "pr-1",
      CONFIG,
      { remoteUrl: "https://bitbucket.org/org/repo", mcpBaseUrl: "https://bitbucket.org", mcpConfigured: true, runId: "run-cli-001" },
      bb,
      [P0],
      { baseDir: tmpDir, argv: ["--no-post-comments"] },
    );

    expect(result.posted).toBe(false);
    expect(result.reason).toBe("disabled-by-cli");
    expect(bb.create_pr_task).not.toHaveBeenCalled();
  });
});
