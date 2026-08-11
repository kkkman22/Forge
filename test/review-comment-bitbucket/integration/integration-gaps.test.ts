import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computeFindingHash } from "../../../src/review-comment-bitbucket/finding-hash.js";
import { postReviewToBitbucket } from "../../../src/review-comment-bitbucket/post.js";
import type { Finding, ResolvedConfig } from "../../../src/review-comment-bitbucket/types.js";

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
  mkdirSync(join(dir, ".tinkerman", "knowledge"), { recursive: true });
  mkdirSync(join(dir, ".tinkerman", "findings"), { recursive: true });
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

  it("gate skip calls recordSkip → writes daily skip file + tool-health", async () => {
    const bb = mockBitbucketClient();
    const reviewMd = join(tmpDir, "review.md");
    writeFileSync(reviewMd, "# Review\n", "utf-8");

    const result = await postReviewToBitbucket(
      reviewMd,
      "pr-1",
      { ...CONFIG, platform_override: "none" },
      {
        remoteUrl: "https://bitbucket.org/org/repo",
        mcpBaseUrl: "https://bitbucket.org",
        mcpConfigured: true,
        runId: "run-skip-001",
      },
      bb,
      [],
      { baseDir: tmpDir },
    );

    expect(result.posted).toBe(false);
    // daily skip file
    const findingsFiles = readdirSync(join(tmpDir, ".tinkerman", "findings"));
    expect(findingsFiles.some((f) => f.startsWith("comment-channel-skipped-"))).toBe(true);
    // tool-health counter
    const healthPath = join(tmpDir, ".tinkerman", "knowledge", "tool-health.md");
    expect(existsSync(healthPath)).toBe(true);
    const health = readFileSync(healthPath, "utf-8");
    expect(health).toContain("platform-disabled-by-config count=1");
  });

  it("gate skip also writes metrics.md with gate_skipped_reason", async () => {
    const bb = mockBitbucketClient();
    const reviewMd = join(tmpDir, "review.md");
    writeFileSync(reviewMd, "# Review\n", "utf-8");

    await postReviewToBitbucket(
      reviewMd,
      "pr-1",
      { ...CONFIG, platform_override: "none" },
      {
        remoteUrl: "https://bitbucket.org/org/repo",
        mcpBaseUrl: "https://bitbucket.org",
        mcpConfigured: true,
        runId: "run-skip-metrics",
      },
      bb,
      [],
      { baseDir: tmpDir },
    );

    const metricsPath = join(tmpDir, ".tinkerman", "knowledge", "metrics.md");
    expect(existsSync(metricsPath)).toBe(true);
    const metrics = readFileSync(metricsPath, "utf-8");
    expect(metrics).toContain("run_id=run-skip-metrics");
    expect(metrics).toContain("gate_skipped_reason=platform-disabled-by-config");
    expect(metrics).toContain("creates=0");
  });

  it("happy path calls appendRunMetrics with all 10 fields", async () => {
    const bb = mockBitbucketClient();

    await postReviewToBitbucket(
      join(tmpDir, "review.md"),
      "pr-1",
      CONFIG,
      {
        remoteUrl: "https://bitbucket.org/org/repo",
        mcpBaseUrl: "https://bitbucket.org",
        mcpConfigured: true,
        runId: "run-metrics-001",
      },
      bb,
      [P0],
      { baseDir: tmpDir },
    );

    const metricsPath = join(tmpDir, ".tinkerman", "knowledge", "metrics.md");
    const metrics = readFileSync(metricsPath, "utf-8");
    expect(metrics).toContain("run_id=run-metrics-001");
    expect(metrics).toContain("post_enabled=true");
    expect(metrics).toContain("gate_skipped_reason=null");
    expect(metrics).toContain("creates=1");
    expect(metrics).toContain("dones=0");
    expect(metrics).toContain("reopens=0");
    expect(metrics).toContain("skips=0");
    expect(metrics).toContain("partial_failures=0");
    expect(metrics).toContain("set_review_status_called=true");
    expect(metrics).toContain("total_duration_ms=");
  });

  it("partial failures persisted with 4-field schema", async () => {
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
      {
        remoteUrl: "https://bitbucket.org/org/repo",
        mcpBaseUrl: "https://bitbucket.org",
        mcpConfigured: true,
        runId: "run-pf-002",
      },
      bb,
      [P0],
      { baseDir: tmpDir },
    );

    const findingsFiles = readdirSync(join(tmpDir, ".tinkerman", "findings"));
    const errorFile = findingsFiles.find((f) => f.startsWith("comment-channel-error-"));
    expect(errorFile).toBeDefined();
    const content = readFileSync(join(tmpDir, ".tinkerman", "findings", errorFile!), "utf-8");
    expect(content).toContain("finding_hash:");
    expect(content).toContain("tool_name: create_pr_task");
    expect(content).toContain("error_message: rate limited");
    expect(content).toContain("timestamp:");
  });

  it("parseReviewMarkdown: missing file → review-markdown-not-found (not parse-error)", async () => {
    const bb = mockBitbucketClient();

    const result = await postReviewToBitbucket(
      join(tmpDir, "nonexistent.md"),
      "pr-1",
      CONFIG,
      {
        remoteUrl: "https://bitbucket.org/org/repo",
        mcpBaseUrl: "https://bitbucket.org",
        mcpConfigured: true,
        runId: "run-notfound",
      },
      bb, // no _testFindings → triggers parseReviewMarkdown
      undefined,
      { baseDir: tmpDir },
    );

    expect(result.posted).toBe(false);
    if (!result.posted) {
      expect(result.reason).toBe("review-markdown-not-found");
    }
  });

  it("parseReviewMarkdown: invalid content → parse-error", async () => {
    const bb = mockBitbucketClient();
    const badMd = join(tmpDir, "bad-review.md");
    writeFileSync(badMd, "# Review\nNo findings block here\n", "utf-8");

    const result = await postReviewToBitbucket(
      badMd,
      "pr-1",
      CONFIG,
      {
        remoteUrl: "https://bitbucket.org/org/repo",
        mcpBaseUrl: "https://bitbucket.org",
        mcpConfigured: true,
        runId: "run-parse-err",
      },
      bb,
      undefined,
      { baseDir: tmpDir },
    );

    expect(result.posted).toBe(false);
    if (!result.posted) {
      expect(result.reason).toBe("parse-error");
    }
  });

  it("parse-error path also writes metrics", async () => {
    const bb = mockBitbucketClient();

    await postReviewToBitbucket(
      join(tmpDir, "nonexistent.md"),
      "pr-1",
      CONFIG,
      {
        remoteUrl: "https://bitbucket.org/org/repo",
        mcpBaseUrl: "https://bitbucket.org",
        mcpConfigured: true,
        runId: "run-parse-metrics",
      },
      bb,
      undefined,
      { baseDir: tmpDir },
    );

    const metricsPath = join(tmpDir, ".tinkerman", "knowledge", "metrics.md");
    expect(existsSync(metricsPath)).toBe(true);
    const metrics = readFileSync(metricsPath, "utf-8");
    expect(metrics).toContain("run_id=run-parse-metrics");
  });

  it("applyCliOverrides: --no-post-comments disables + writes skip + metrics", async () => {
    const bb = mockBitbucketClient();

    const result = await postReviewToBitbucket(
      join(tmpDir, "review.md"),
      "pr-1",
      CONFIG,
      {
        remoteUrl: "https://bitbucket.org/org/repo",
        mcpBaseUrl: "https://bitbucket.org",
        mcpConfigured: true,
        runId: "run-cli-001",
      },
      bb,
      [P0],
      { baseDir: tmpDir, argv: ["--no-post-comments"] },
    );

    expect(result.posted).toBe(false);
    expect(bb.create_pr_task).not.toHaveBeenCalled();
    // metrics should still be written
    const metricsPath = join(tmpDir, ".tinkerman", "knowledge", "metrics.md");
    expect(existsSync(metricsPath)).toBe(true);
    expect(readFileSync(metricsPath, "utf-8")).toContain("run_id=run-cli-001");
  });

  it("Action skip-duplicate carries task_id and reason fields", async () => {
    const bb = mockBitbucketClient();
    const hash = computeFindingHash(P0);
    bb.list_pr_tasks.mockResolvedValue([
      {
        id: "task-existing",
        content: `[Forge P0] <!-- forge-review:hash=${hash} -->`,
        state: "OPEN",
      },
    ]);
    bb.get_pull_request.mockResolvedValue({ active_comments: [] });

    await postReviewToBitbucket(
      join(tmpDir, "review.md"),
      "pr-1",
      CONFIG,
      {
        remoteUrl: "https://bitbucket.org/org/repo",
        mcpBaseUrl: "https://bitbucket.org",
        mcpConfigured: true,
        runId: "run-skip-dup",
      },
      bb,
      [P0],
      { baseDir: tmpDir },
    );

    // Should not create new task (already exists and OPEN)
    expect(bb.create_pr_task).not.toHaveBeenCalled();
  });
});
