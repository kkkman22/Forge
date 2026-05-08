import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isReviewComplete, parseReviewFrontmatter } from "../../scripts/cmux-mirror/lib/reviews.mjs";

const FIXTURE = join(__dirname, "fixtures", "review-in-progress.md");

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `cmux-reviews-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("reviews: frontmatter parsing (R15.7)", () => {
  it("parses review-in-progress fixture correctly", async () => {
    const fm = await parseReviewFrontmatter(FIXTURE);
    expect(fm.topic).toBe("user-pagination");
    expect(fm.reviewers).toEqual(["spec-check", "quality-check", "security-check"]);
    expect(fm.layers_status).toEqual({
      spec_check: "done",
      quality_check: "pending",
      security_check: "done",
    });
    expect(fm.completed_at).toBeNull();
  });

  it("detects incomplete review", async () => {
    const fm = await parseReviewFrontmatter(FIXTURE);
    expect(isReviewComplete(fm)).toBe(false);
  });

  it("detects complete review when all layers done and completed_at set", async () => {
    const file = join(tmpDir, "complete.md");
    writeFileSync(
      file,
      [
        "---",
        "topic: test",
        "reviewers: [spec-check]",
        "layers_status:",
        "  spec_check: done",
        "completed_at: 2026-05-08T12:00:00+08:00",
        "---",
        "",
        "# Review",
      ].join("\n"),
    );

    const fm = await parseReviewFrontmatter(file);
    expect(isReviewComplete(fm)).toBe(true);
  });

  it("tolerates old format without layers_status (R15.7)", async () => {
    const file = join(tmpDir, "old-format.md");
    writeFileSync(
      file,
      [
        "---",
        "topic: legacy",
        "reviewers: [spec-check]",
        "---",
        "",
        "# Old Review",
      ].join("\n"),
    );

    const fm = await parseReviewFrontmatter(file);
    expect(fm.topic).toBe("legacy");
    expect(fm.layers_status).toEqual({});
    expect(isReviewComplete(fm)).toBe(false);
  });

  it("returns empty frontmatter for file without YAML delimiter", async () => {
    const file = join(tmpDir, "no-fm.md");
    writeFileSync(file, "# No frontmatter here\n\nJust content.");

    const fm = await parseReviewFrontmatter(file);
    expect(fm).toEqual({});
  });

  it("returns empty frontmatter for non-existent file", async () => {
    const fm = await parseReviewFrontmatter(join(tmpDir, "nope.md"));
    expect(fm).toEqual({});
  });
});
