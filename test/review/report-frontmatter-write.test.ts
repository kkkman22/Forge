import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { queryEvidenceArtifacts } from "../../src/evidence-artifact.js";
import { persistReviewEvidenceArtifact, type ReviewReportFrontmatter } from "../../src/review.js";

describe("ReviewReportFrontmatter — methodology field", () => {
  it("includes methodology field with default subagent-parallel", () => {
    const fm: ReviewReportFrontmatter = {
      topic: "test-feature",
      date: "2026-05-17",
      result: "pass",
      reviewed_at_commit: "abc123",
      evidence_artifact_id: "review-artifact-1",
      p0_count: 0,
      p1_count: 0,
      p2_count: 1,
      p3_count: 0,
      methodology: "subagent-parallel",
    };
    expect(fm.methodology).toBe("subagent-parallel");
    expect(fm.evidence_artifact_id).toBe("review-artifact-1");
  });

  it("accepts custom methodology argument", () => {
    const fm: ReviewReportFrontmatter = {
      topic: "test-feature",
      date: "2026-05-17",
      result: "blocked",
      reviewed_at_commit: "abc123",
      p0_count: 1,
      p1_count: 0,
      p2_count: 0,
      p3_count: 0,
      methodology: "unavailable",
    };
    expect(fm.methodology).toBe("unavailable");
  });
});

describe("persistReviewEvidenceArtifact", () => {
  it("writes a review artifact and returns an id for report frontmatter", () => {
    const root = mkdtempSync(join(tmpdir(), "forge-review-artifact-"));
    try {
      const result = persistReviewEvidenceArtifact(
        root,
        {
          topic: "workflow-graph-dsl",
          date: "2026-06-09",
          result: "pass",
          reviewed_at_commit: "abc123",
          p0_count: 0,
          p1_count: 0,
          p2_count: 0,
          p3_count: 1,
          methodology: "subagent-parallel",
        },
        {
          artifactId: "review-1",
          runId: "run-1",
          createdAt: "2026-06-09T01:00:00.000Z",
          producer: "forge-review",
        },
      );

      expect(result.ok).toBe(true);
      expect(result.ok ? result.artifactId : "").toBe("review-1");

      const artifacts = queryEvidenceArtifacts(root, {
        topic: "workflow-graph-dsl",
        kind: "review",
      });
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0]).toMatchObject({
        artifact_id: "review-1",
        commit: "abc123",
        result: "pass",
        producer: "forge-review",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
