import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  appendRunMetrics,
  recordPartialFailures,
} from "../../src/review-comment-bitbucket/observability.js";
import type { ToolFailure } from "../../src/review-comment-bitbucket/types.js";

describe("Unit: partial_failures append to same-day file without overwriting", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "observability-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("appends multiple calls to same file", async () => {
    const now = new Date("2026-05-23T10:00:00Z");
    const dateStr = now.toISOString().split("T")[0];

    const failures1: ToolFailure[] = [
      {
        finding_hash: "hash1",
        tool_name: "create_pr_task",
        error_message: "Error 1",
        timestamp: now.getTime(),
      },
    ];

    const failures2: ToolFailure[] = [
      {
        finding_hash: "hash2",
        tool_name: "add_comment",
        error_message: "Error 2",
        timestamp: now.getTime() + 1000,
      },
    ];

    await recordPartialFailures(failures1, tmpDir);
    await recordPartialFailures(failures2, tmpDir);

    const errorFilePath = path.join(
      tmpDir,
      ".tinkerman",
      "findings",
      `comment-channel-error-${dateStr}.md`,
    );
    expect(fs.existsSync(errorFilePath)).toBe(true);

    const content = fs.readFileSync(errorFilePath, "utf-8");
    expect(content).toContain("hash1");
    expect(content).toContain("hash2");
    expect(content).toContain("Error 1");
    expect(content).toContain("Error 2");
  });
});

describe("Unit: metrics.md appends line with all 10 fields", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "observability-test-"));
    fs.mkdirSync(path.join(tmpDir, ".tinkerman", "knowledge"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("creates metrics.md with all 10 fields", async () => {
    await appendRunMetrics(
      {
        run_id: "run-123",
        post_enabled: true,
        gate_skipped_reason: null,
        creates: 5,
        dones: 2,
        reopens: 1,
        skips: 3,
        partial_failures: 0,
        set_review_status_called: true,
        total_duration_ms: 1234,
      },
      tmpDir,
    );

    const metricsPath = path.join(tmpDir, ".tinkerman", "knowledge", "metrics.md");
    expect(fs.existsSync(metricsPath)).toBe(true);

    const content = fs.readFileSync(metricsPath, "utf-8");
    expect(content).toContain("run_id=run-123");
    expect(content).toContain("post_enabled=true");
    expect(content).toContain("gate_skipped_reason=null");
    expect(content).toContain("creates=5");
    expect(content).toContain("dones=2");
    expect(content).toContain("reopens=1");
    expect(content).toContain("skips=3");
    expect(content).toContain("partial_failures=0");
    expect(content).toContain("set_review_status_called=true");
    expect(content).toContain("total_duration_ms=1234");
  });

  it("appends multiple lines to existing metrics.md", async () => {
    await appendRunMetrics(
      {
        run_id: "run-123",
        post_enabled: true,
        gate_skipped_reason: null,
        creates: 5,
        dones: 2,
        reopens: 1,
        skips: 3,
        partial_failures: 0,
        set_review_status_called: true,
        total_duration_ms: 1234,
      },
      tmpDir,
    );

    await appendRunMetrics(
      {
        run_id: "run-456",
        post_enabled: false,
        gate_skipped_reason: "platform-not-bitbucket",
        creates: 0,
        dones: 0,
        reopens: 0,
        skips: 0,
        partial_failures: 0,
        set_review_status_called: false,
        total_duration_ms: 567,
      },
      tmpDir,
    );

    const metricsPath = path.join(tmpDir, ".tinkerman", "knowledge", "metrics.md");
    const content = fs.readFileSync(metricsPath, "utf-8");

    const lines = content.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBe(2);
    expect(lines[0]).toContain("run_id=run-123");
    expect(lines[1]).toContain("run_id=run-456");
  });
});

describe("Unit: posted=false path writes metrics with gate_skipped_reason", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "observability-test-"));
    fs.mkdirSync(path.join(tmpDir, ".tinkerman", "knowledge"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("gate skip writes metrics with reason non-null and counts 0", async () => {
    await appendRunMetrics(
      {
        run_id: "run-123",
        post_enabled: false,
        gate_skipped_reason: "mcp-not-configured",
        creates: 0,
        dones: 0,
        reopens: 0,
        skips: 0,
        partial_failures: 0,
        set_review_status_called: false,
        total_duration_ms: 123,
      },
      tmpDir,
    );

    const metricsPath = path.join(tmpDir, ".tinkerman", "knowledge", "metrics.md");
    const content = fs.readFileSync(metricsPath, "utf-8");

    expect(content).toContain("post_enabled=false");
    expect(content).toContain("gate_skipped_reason=mcp-not-configured");
    expect(content).toContain("creates=0");
    expect(content).toContain("dones=0");
    expect(content).toContain("reopens=0");
    expect(content).toContain("skips=0");
  });
});

describe("Unit: posted=true but all partial-failed writes metrics correctly", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "observability-test-"));
    fs.mkdirSync(path.join(tmpDir, ".tinkerman", "findings"), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, ".tinkerman", "knowledge"), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("partial failures recorded and metrics show partial_failures count", async () => {
    const now = new Date("2026-05-23T10:00:00Z");
    const failures: ToolFailure[] = [
      {
        finding_hash: "hash1",
        tool_name: "create_pr_task",
        error_message: "Error 1",
        timestamp: now.getTime(),
      },
      {
        finding_hash: "hash2",
        tool_name: "add_comment",
        error_message: "Error 2",
        timestamp: now.getTime() + 1000,
      },
    ];

    await recordPartialFailures(failures, tmpDir);

    await appendRunMetrics(
      {
        run_id: "run-123",
        post_enabled: true,
        gate_skipped_reason: null,
        creates: 5,
        dones: 2,
        reopens: 1,
        skips: 3,
        partial_failures: 2,
        set_review_status_called: true,
        total_duration_ms: 1234,
      },
      tmpDir,
    );

    const metricsPath = path.join(tmpDir, ".tinkerman", "knowledge", "metrics.md");
    const content = fs.readFileSync(metricsPath, "utf-8");

    expect(content).toContain("post_enabled=true");
    expect(content).toContain("gate_skipped_reason=null");
    expect(content).toContain("partial_failures=2");

    const errorFilePath = path.join(
      tmpDir,
      ".tinkerman",
      "findings",
      `comment-channel-error-${now.toISOString().split("T")[0]}.md`,
    );
    const errorContent = fs.readFileSync(errorFilePath, "utf-8");

    expect(errorContent).toContain("hash1");
    expect(errorContent).toContain("hash2");
    expect(errorContent).toContain("Error 1");
    expect(errorContent).toContain("Error 2");
  });
});
