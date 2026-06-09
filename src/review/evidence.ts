import {
  type EvidenceArtifactResult,
  type EvidenceWriteResult,
  hashEvidenceInput,
  writeEvidenceArtifact,
} from "../evidence-artifact.js";
import type { ReviewReportFrontmatter } from "./types.js";

export type EvidenceWriteFailure = Extract<EvidenceWriteResult, { ok: false }>;

export type ReviewEvidenceWriteResult =
  | { ok: true; artifactId: string; path: string; indexPath: string }
  | EvidenceWriteFailure;

export interface PersistReviewEvidenceArtifactOptions {
  artifactId?: string;
  runId?: string;
  createdAt?: string;
  producer?: string;
  commit?: string;
}

export function persistReviewEvidenceArtifact(
  projectRoot: string,
  frontmatter: ReviewReportFrontmatter,
  options: PersistReviewEvidenceArtifactOptions = {},
): ReviewEvidenceWriteResult {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const artifactId =
    options.artifactId ?? `review-${safeSegment(frontmatter.topic)}-${safeSegment(createdAt)}`;
  const runId = options.runId ?? artifactId;
  const commit = frontmatter.reviewed_at_commit ?? options.commit ?? "unknown";

  const result = writeEvidenceArtifact(projectRoot, {
    schema_version: 1,
    artifact_id: artifactId,
    kind: "review",
    topic: frontmatter.topic,
    run_id: runId,
    trace_id: runId,
    commit,
    command: `forge review ${frontmatter.topic}`,
    exit_code: frontmatter.result === "pass" ? 0 : 1,
    input_hash: hashEvidenceInput(frontmatter),
    result: reviewResultToArtifactResult(frontmatter.result),
    producer: options.producer ?? "forge-review",
    created_at: createdAt,
  });

  return result.ok ? { ...result, artifactId } : result;
}

function reviewResultToArtifactResult(
  result: ReviewReportFrontmatter["result"],
): EvidenceArtifactResult {
  if (result === "incomplete") return "inconclusive";
  return result;
}

function safeSegment(value: string): string {
  const normalized = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "artifact";
}
