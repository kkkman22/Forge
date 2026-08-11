import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("mirror: review observation (R15)", () => {
  let dir: string;
  let forgeDir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cmux-review-observe-"));
    forgeDir = join(dir, "tinkerman");
    mkdirSync(forgeDir, { recursive: true });
    mkdirSync(join(forgeDir, "progress"), { recursive: true });
    mkdirSync(join(forgeDir, "reviews"), { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("parses layers_status frontmatter and tracks per-layer progress", async () => {
    const { parseReviewFrontmatter, isReviewComplete } = await import(
      "../../scripts/cmux-mirror/lib/reviews.mjs"
    );

    const reviewFile = join(forgeDir, "reviews", "topic.md");
    writeFileSync(
      reviewFile,
      [
        "---",
        "topic: topic",
        "layers_status:",
        "  spec_check: pending",
        "  quality_check: pending",
        "  security_check: pending",
        "---",
        "",
        "# Review",
      ].join("\n"),
    );

    const fm = parseReviewFrontmatter(reviewFile);
    expect(fm.layers_status).toEqual({
      spec_check: "pending",
      quality_check: "pending",
      security_check: "pending",
    });
    expect(isReviewComplete(fm)).toBe(false);
  });

  it("emits notification when all review layers are done", async () => {
    const { emitCommands } = await import("../../scripts/cmux-mirror/lib/emitter.mjs");

    const prev = {
      phase: "review",
      tier: "standard",
      task: "topic",
      progress: null,
      review: {
        completed: false,
        layers: { spec_check: "done", quality_check: "done", security_check: "pending" },
      },
    };
    const next = {
      phase: "review",
      tier: "standard",
      task: "topic",
      progress: null,
      review: {
        completed: true,
        layers: { spec_check: "done", quality_check: "done", security_check: "done" },
      },
    };

    const cmds = emitCommands(prev, next);
    const notify = cmds.find((c: { method?: string }) => c.method === "notification.create");
    expect(notify).toBeDefined();
    expect(notify?.params).toHaveProperty("title", "Review Complete");
  });

  it("detects incomplete review when completed_at is missing", async () => {
    const { parseReviewFrontmatter, isReviewComplete } = await import(
      "../../scripts/cmux-mirror/lib/reviews.mjs"
    );

    const reviewFile = join(forgeDir, "reviews", "topic.md");
    writeFileSync(
      reviewFile,
      [
        "---",
        "topic: topic",
        "layers_status:",
        "  spec_check: done",
        "  quality_check: done",
        "  security_check: done",
        "---",
        "",
        "# Review",
      ].join("\n"),
    );

    // All layers done but no completed_at
    const fm = parseReviewFrontmatter(reviewFile);
    expect(isReviewComplete(fm)).toBe(false);
  });

  it("reader integrates review state into canonical payload", async () => {
    const { readForgeState } = await import("../../scripts/cmux-mirror/lib/reader.mjs");

    writeFileSync(
      join(forgeDir, "status.md"),
      [
        "---",
        'current_task: "topic"',
        'tier: "standard"',
        'project_phase: "review"',
        "---",
        "",
        "# Status",
      ].join("\n"),
    );

    const reviewFile = join(forgeDir, "reviews", "topic.md");
    writeFileSync(
      reviewFile,
      [
        "---",
        "topic: topic",
        "layers_status:",
        "  spec_check: done",
        "  quality_check: in_progress",
        "  security_check: pending",
        "completed_at:",
        "---",
        "",
        "# Review",
      ].join("\n"),
    );

    const state = readForgeState(forgeDir);
    expect(state.review).toBeDefined();
    expect(state.review?.completed).toBe(false);
    expect(state.review?.layers).toEqual({
      spec_check: "done",
      quality_check: "in_progress",
      security_check: "pending",
    });
  });
});
