import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import {
  atomicUpdateFrontmatter,
  initReviewFrontmatter,
  markLayerStatus,
} from "../../src/review.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `cmux-review-fm-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("review frontmatter atomic rewrite (R15.1–R15.6)", () => {
  it("initReviewFrontmatter creates file with correct structure (R15.1)", () => {
    const file = join(tmpDir, "review-test.md");
    initReviewFrontmatter(file, "user-pagination", [
      "spec-check",
      "quality-check",
      "security-check",
    ]);

    const content = readFileSync(file, "utf-8");
    expect(content.startsWith("---\n")).toBe(true);

    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    expect(fmMatch).not.toBeNull();

    // Parse the YAML frontmatter
    const fm = JSON.parse(JSON.stringify(parseYaml(fmMatch?.[1] ?? "")));
    expect(fm.topic).toBe("user-pagination");
    expect(fm.reviewers).toEqual(["spec-check", "quality-check", "security-check"]);
    expect(fm.layers_status).toEqual({
      spec_check: "pending",
      quality_check: "pending",
      security_check: "pending",
    });
    expect(fm.completed_at).toBeNull();
  });

  it("markLayerStatus updates a single layer (R15.2)", () => {
    const file = join(tmpDir, "review-test.md");
    initReviewFrontmatter(file, "test-topic", ["spec-check", "quality-check"]);
    markLayerStatus(file, "spec_check", "done");

    const content = readFileSync(file, "utf-8");
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    const fm = parseYaml(fmMatch?.[1] ?? "");
    expect(fm.layers_status.spec_check).toBe("done");
    expect(fm.layers_status.quality_check).toBe("pending");
  });

  it("markLayerStatus sets completed_at when all layers done (R15.3)", () => {
    const file = join(tmpDir, "review-test.md");
    initReviewFrontmatter(file, "test-topic", ["spec-check"]);
    markLayerStatus(file, "spec_check", "done");

    const content = readFileSync(file, "utf-8");
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    const fm = parseYaml(fmMatch?.[1] ?? "");
    expect(fm.completed_at).not.toBeNull();
  });

  it("atomicUpdateFrontmatter preserves body content (R15.4)", () => {
    const file = join(tmpDir, "review-body.md");
    writeFileSync(
      file,
      ["---", "topic: test", "---", "", "# Review Body", "", "Some content here."].join("\n"),
    );

    atomicUpdateFrontmatter(file, (fm) => {
      fm.new_field = "added";
    });

    const content = readFileSync(file, "utf-8");
    expect(content).toContain("# Review Body");
    expect(content).toContain("Some content here.");
    expect(content).toContain("new_field: added");
  });

  it("atomicUpdateFrontmatter is atomic — no partial writes on error (R15.5)", () => {
    const file = join(tmpDir, "review-atomic.md");
    writeFileSync(file, ["---", "topic: original", "---", "", "# Body"].join("\n"));

    const originalContent = readFileSync(file, "utf-8");

    try {
      atomicUpdateFrontmatter(file, () => {
        throw new Error("boom");
      });
    } catch {
      // expected
    }

    // File should be unchanged
    expect(readFileSync(file, "utf-8")).toBe(originalContent);
  });

  it("handles file without existing frontmatter gracefully (R15.6)", () => {
    const file = join(tmpDir, "review-no-fm.md");
    writeFileSync(file, "# Just markdown\n\nNo frontmatter.");

    atomicUpdateFrontmatter(file, (fm) => {
      fm.topic = "injected";
    });

    const content = readFileSync(file, "utf-8");
    expect(content).toContain("topic: injected");
    expect(content).toContain("# Just markdown");
  });
});
