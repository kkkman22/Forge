import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { recordSkip } from "../../src/review-comment-bitbucket/skip-trace.js";
import type { GateSkipReason, PostContext } from "../../src/review-comment-bitbucket/types.js";

describe("Unit: run markdown append-only", () => {
  let tmpDir: string;
  let reviewMarkdownPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skip-trace-test-"));
    reviewMarkdownPath = path.join(tmpDir, "review.md");
    fs.writeFileSync(reviewMarkdownPath, "# Review\n\n## Findings\n");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("multiple calls append, never overwrite", async () => {
    const ctx: PostContext = {
      remoteUrl: "https://bitbucket.org/test/repo/pull/1",
      mcpBaseUrl: "https://api.bitbucket.org",
      mcpConfigured: true,
      runId: "run-123",
    };

    await recordSkip(reviewMarkdownPath, "platform-not-bitbucket", ctx);
    await recordSkip(reviewMarkdownPath, "mcp-not-configured", ctx);

    const content = fs.readFileSync(reviewMarkdownPath, "utf-8");
    expect(content).toContain("## Findings\n");
    expect(content).toContain("## comment_channel: skipped (reason: platform-not-bitbucket)");
    expect(content).toContain("## comment_channel: skipped (reason: mcp-not-configured)");
  });
});

describe("Unit: daily skip file created/append", () => {
  let tmpDir: string;
  let reviewMarkdownPath: string;
  let baseDir: string;
  let dateStr: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skip-trace-test-"));
    reviewMarkdownPath = path.join(tmpDir, "review.md");
    baseDir = path.join(tmpDir, ".tinkerman");
    fs.mkdirSync(path.join(baseDir, "findings"), { recursive: true });
    fs.writeFileSync(reviewMarkdownPath, "# Review\n");

    const now = new Date();
    dateStr = now.toISOString().split("T")[0];
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates file if not exists", async () => {
    const ctx: PostContext = {
      remoteUrl: "https://bitbucket.org/test/repo/pull/1",
      mcpBaseUrl: "https://api.bitbucket.org",
      mcpConfigured: true,
      runId: "run-123",
    };

    await recordSkip(reviewMarkdownPath, "platform-not-bitbucket", ctx);

    const skipFilePath = path.join(baseDir, "findings", `comment-channel-skipped-${dateStr}.md`);
    expect(fs.existsSync(skipFilePath)).toBe(true);

    const content = fs.readFileSync(skipFilePath, "utf-8");
    expect(content).toContain("reason: platform-not-bitbucket");
    expect(content).toContain("remote_url: https://bitbucket.org/test/repo/pull/1");
    expect(content).toContain("mcp_base_url: https://api.bitbucket.org");
  });

  it("appends to existing file", async () => {
    const ctx: PostContext = {
      remoteUrl: "https://bitbucket.org/test/repo/pull/1",
      mcpBaseUrl: "https://api.bitbucket.org",
      mcpConfigured: true,
      runId: "run-123",
    };

    await recordSkip(reviewMarkdownPath, "platform-not-bitbucket", ctx);
    await recordSkip(reviewMarkdownPath, "mcp-not-configured", ctx);

    const skipFilePath = path.join(baseDir, "findings", `comment-channel-skipped-${dateStr}.md`);
    const content = fs.readFileSync(skipFilePath, "utf-8");

    const lines = content.split("\n").filter((l) => l.includes("reason:"));
    expect(lines.length).toBe(2);
  });
});

describe("Unit: tool health counter incremented per reason", () => {
  let tmpDir: string;
  let reviewMarkdownPath: string;
  let baseDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skip-trace-test-"));
    reviewMarkdownPath = path.join(tmpDir, "review.md");
    baseDir = path.join(tmpDir, ".tinkerman");
    fs.mkdirSync(path.join(baseDir, "knowledge"), { recursive: true });
    fs.mkdirSync(path.join(baseDir, "findings"), { recursive: true });
    fs.writeFileSync(reviewMarkdownPath, "# Review\n");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("increments counter for same reason", async () => {
    const ctx: PostContext = {
      remoteUrl: "https://bitbucket.org/test/repo/pull/1",
      mcpBaseUrl: "https://api.bitbucket.org",
      mcpConfigured: true,
      runId: "run-123",
    };

    await recordSkip(reviewMarkdownPath, "platform-not-bitbucket", ctx);
    await recordSkip(reviewMarkdownPath, "platform-not-bitbucket", ctx);

    const healthPath = path.join(baseDir, "knowledge", "tool-health.md");
    expect(fs.existsSync(healthPath)).toBe(true);

    const content = fs.readFileSync(healthPath, "utf-8");
    // Should have count=2 for platform-not-bitbucket
    expect(content).toContain("platform-not-bitbucket");
    const match = content.match(/platform-not-bitbucket.*count=(\d+)/);
    expect(match?.[1]).toBe("2");
  });

  it("increments different reasons separately", async () => {
    const ctx: PostContext = {
      remoteUrl: "https://bitbucket.org/test/repo/pull/1",
      mcpBaseUrl: "https://api.bitbucket.org",
      mcpConfigured: true,
      runId: "run-123",
    };

    await recordSkip(reviewMarkdownPath, "platform-not-bitbucket", ctx);
    await recordSkip(reviewMarkdownPath, "mcp-not-configured", ctx);
    await recordSkip(reviewMarkdownPath, "platform-not-bitbucket", ctx);

    const healthPath = path.join(baseDir, "knowledge", "tool-health.md");
    const content = fs.readFileSync(healthPath, "utf-8");

    const platformMatch = content.match(/platform-not-bitbucket.*count=(\d+)/);
    const mcpMatch = content.match(/mcp-not-configured.*count=(\d+)/);

    expect(platformMatch?.[1]).toBe("2");
    expect(mcpMatch?.[1]).toBe("1");
  });
});

describe("Unit: write failure no throw", () => {
  let tmpDir: string;
  let reviewMarkdownPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skip-trace-test-"));
    reviewMarkdownPath = path.join(tmpDir, "review.md");
    fs.writeFileSync(reviewMarkdownPath, "# Review\n");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("dir not writable → no throw, only console.warn", async () => {
    const ctx: PostContext = {
      remoteUrl: "https://bitbucket.org/test/repo/pull/1",
      mcpBaseUrl: "https://api.bitbucket.org",
      mcpConfigured: true,
      runId: "run-123",
    };

    // Make the directory read-only
    fs.chmodSync(tmpDir, 0o444);

    const warnSpy = console.warn;
    console.warn = () => {};

    try {
      await expect(
        recordSkip(reviewMarkdownPath, "platform-not-bitbucket", ctx),
      ).resolves.not.toThrow();
    } finally {
      console.warn = warnSpy;
      fs.chmodSync(tmpDir, 0o755);
    }
  });
});

describe("Unit: skip trace makes 0 MCP tool calls", () => {
  let tmpDir: string;
  let reviewMarkdownPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "skip-trace-test-"));
    reviewMarkdownPath = path.join(tmpDir, "review.md");
    fs.mkdirSync(path.join(tmpDir, ".tinkerman", "findings"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, ".tinkerman", "knowledge"), { recursive: true });
    fs.writeFileSync(reviewMarkdownPath, "# Review\n");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("recordSkip only writes files, no MCP calls", async () => {
    const ctx: PostContext = {
      remoteUrl: "https://bitbucket.org/test/repo/pull/1",
      mcpBaseUrl: "https://api.bitbucket.org",
      mcpConfigured: true,
      runId: "run-123",
    };

    // Mock any potential tool calls to verify none are made
    const originalFetch = global.fetch;
    let fetchCalled = false;
    global.fetch = () => {
      fetchCalled = true;
      return Promise.resolve(new Response());
    };

    try {
      await recordSkip(reviewMarkdownPath, "platform-not-bitbucket", ctx);
      expect(fetchCalled).toBe(false);
    } finally {
      global.fetch = originalFetch;
    }
  });
});
