import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { queryEvidenceArtifacts } from "../../src/evidence-artifact.js";
import { persistReviewEvidenceArtifact } from "../../src/review.js";
describe("ReviewReportFrontmatter — methodology field", () => {
    it("includes methodology field with default subagent-parallel", () => {
        const fm = {
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
        const fm = {
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
            const result = persistReviewEvidenceArtifact(root, {
                topic: "workflow-graph-dsl",
                date: "2026-06-09",
                result: "pass",
                reviewed_at_commit: "abc123",
                p0_count: 0,
                p1_count: 0,
                p2_count: 0,
                p3_count: 1,
                methodology: "subagent-parallel",
            }, {
                artifactId: "review-1",
                runId: "run-1",
                createdAt: "2026-06-09T01:00:00.000Z",
                producer: "forge-review",
            });
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
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("uses default provenance values and maps incomplete reviews to inconclusive", () => {
        const root = mkdtempSync(join(tmpdir(), "forge-review-artifact-defaults-"));
        try {
            const result = persistReviewEvidenceArtifact(root, {
                topic: "!!!",
                date: "2026-06-09",
                result: "incomplete",
                p0_count: 0,
                p1_count: 0,
                p2_count: 0,
                p3_count: 0,
                methodology: "unavailable",
            });
            expect(result.ok).toBe(true);
            if (!result.ok)
                return;
            expect(result.artifactId).toMatch(/^review-artifact-/);
            const artifacts = queryEvidenceArtifacts(root, { kind: "review" });
            expect(artifacts[0]).toMatchObject({
                topic: "!!!",
                commit: "unknown",
                command: "forge review !!!",
                exit_code: 1,
                result: "inconclusive",
                producer: "forge-review",
            });
            expect(artifacts[0].run_id).toBe(result.artifactId);
            expect(artifacts[0].trace_id).toBe(result.artifactId);
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
    it("uses an explicit fallback commit and returns writer failures", () => {
        const root = mkdtempSync(join(tmpdir(), "forge-review-artifact-failure-"));
        try {
            const frontmatter = {
                topic: "review-failure",
                date: "2026-06-09",
                result: "fail",
                p0_count: 1,
                p1_count: 0,
                p2_count: 0,
                p3_count: 0,
                methodology: "subagent-parallel",
            };
            const first = persistReviewEvidenceArtifact(root, frontmatter, {
                artifactId: "review-dup",
                runId: "run-dup",
                commit: "fallback-commit",
                createdAt: "2026-06-09T02:00:00.000Z",
            });
            expect(first.ok).toBe(true);
            expect(queryEvidenceArtifacts(root, { topic: "review-failure" })[0]).toMatchObject({
                commit: "fallback-commit",
                exit_code: 1,
                result: "fail",
            });
            expect(persistReviewEvidenceArtifact(root, frontmatter, {
                artifactId: "review-dup",
                runId: "run-dup",
                createdAt: "2026-06-09T02:00:00.000Z",
            })).toEqual({
                ok: false,
                code: "ARTIFACT_ALREADY_EXISTS",
                message: "Evidence artifact already exists: review-dup",
            });
        }
        finally {
            rmSync(root, { recursive: true, force: true });
        }
    });
});
//# sourceMappingURL=report-frontmatter-write.test.js.map