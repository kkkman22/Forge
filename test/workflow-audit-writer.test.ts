import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { WorkflowAuditWriter, FrozenZoneViolation } from "../src/workflow-audit-writer.js";

describe("WorkflowAuditWriter", () => {
  let tmpDir: string;
  let forgeRoot: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `waw-test-${Date.now()}`);
    forgeRoot = join(tmpDir, ".forge");
    mkdirSync(forgeRoot, { recursive: true });
    mkdirSync(join(forgeRoot, "reviews"), { recursive: true });
    mkdirSync(join(forgeRoot, "decisions"), { recursive: true });
    mkdirSync(join(forgeRoot, "knowledge", "sessions"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  const frozenChecker = (p: string) =>
    p.includes("/specs/") || p.includes("/plans/") || p.endsWith("config.md");

  it("writes review to .forge/reviews/ and appends", async () => {
    const writer = new WorkflowAuditWriter(forgeRoot, frozenChecker);
    const existing = "# Existing review\n";
    writeFileSync(join(forgeRoot, "reviews", "topic.md"), existing);

    await writer.write({
      subcommand: "review",
      runId: "run-001",
      topic: "topic",
      payload: { methodology: "workflow", findings: ["f1"] },
    });

    const content = readFileSync(join(forgeRoot, "reviews", "topic.md"), "utf-8");
    expect(content.startsWith(existing)).toBe(true);
    expect(content).toContain("methodology");
  });

  it("writes decide to .forge/decisions/ with date-slug name", async () => {
    const writer = new WorkflowAuditWriter(forgeRoot, frozenChecker);
    await writer.write({
      subcommand: "decide",
      runId: "run-002",
      topic: "auth-strategy",
      payload: { decision: "use JWT" },
    });

    const dir = join(forgeRoot, "decisions");
    const files = readdirSync(dir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^\d{4}-\d{2}-\d{2}-auth-strategy\.md$/);
  });

  it("writes learn to .forge/knowledge/sessions/", async () => {
    const writer = new WorkflowAuditWriter(forgeRoot, frozenChecker);
    await writer.write({
      subcommand: "learn",
      runId: "run-003",
      topic: "session",
      payload: { lessons: ["l1"] },
    });

    expect(existsSync(join(forgeRoot, "knowledge", "sessions", "run-003.md"))).toBe(true);
  });

  it("creates target directory if missing", async () => {
    const writer = new WorkflowAuditWriter(forgeRoot, frozenChecker);
    // Remove reviews dir
    rmSync(join(forgeRoot, "reviews"), { recursive: true });

    await writer.write({
      subcommand: "review",
      runId: "run-004",
      topic: "new-review",
      payload: { findings: [] },
    });

    expect(existsSync(join(forgeRoot, "reviews"))).toBe(true);
  });

  it("throws FrozenZoneViolation for locked spec paths", async () => {
    const writer = new WorkflowAuditWriter(forgeRoot, (p) =>
      p.includes("specs/locked"),
    );
    // Force the resolveDestPath to return a frozen path
    const writerWithFrozenPath = new WorkflowAuditWriter(
      forgeRoot,
      () => true, // everything is frozen
    );

    await expect(
      writerWithFrozenPath.write({
        subcommand: "review",
        runId: "run-005",
        topic: "frozen-topic",
        payload: {},
      }),
    ).rejects.toThrow(FrozenZoneViolation);
  });

  it("preserves existing content prefix on append", async () => {
    const writer = new WorkflowAuditWriter(forgeRoot, frozenChecker);
    const original = "# Original\n\nFinding 1 here.\n";
    writeFileSync(join(forgeRoot, "reviews", "append-test.md"), original);

    await writer.write({
      subcommand: "review",
      runId: "run-006",
      topic: "append-test",
      payload: { new_finding: true },
    });

    const updated = readFileSync(join(forgeRoot, "reviews", "append-test.md"), "utf-8");
    expect(updated.startsWith(original)).toBe(true);
    expect(updated.length).toBeGreaterThan(original.length);
  });
});
