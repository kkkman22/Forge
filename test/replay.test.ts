import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type EvidenceArtifact, writeEvidenceArtifact } from "../src/evidence-artifact.js";
import { buildEvidenceReplay, renderReplayTimeline } from "../src/replay.js";

const tempRoots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "forge-replay-test-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function writeDoc(root: string, relPath: string, content: string): void {
  const fullPath = join(root, ".tinkerman", relPath);
  mkdirSync(join(fullPath, ".."), { recursive: true });
  writeFileSync(fullPath, content, "utf-8");
}

function artifact(overrides: Partial<EvidenceArtifact> = {}): EvidenceArtifact {
  const base: EvidenceArtifact = {
    schema_version: 1,
    artifact_id: "review-new",
    kind: "review",
    topic: "topic-a",
    run_id: "run-1",
    trace_id: "run-1",
    commit: "abc123",
    command: "npm run check",
    exit_code: 0,
    input_hash: "hash-1",
    result: "pass",
    producer: "vitest",
    created_at: "2026-06-09T02:00:00.000Z",
  };
  return Object.assign(base, overrides);
}

describe("evidence chain replay", () => {
  it("builds a timeline from stage files and artifacts with explicit missing stages", () => {
    const root = tempRoot();
    writeDoc(
      root,
      "specs/topic-a/requirements.md",
      "---\nstatus: locked\n---\n# Requirements\n\n## Purpose\n\nSpec summary.",
    );
    writeDoc(
      root,
      "progress/topic-a.md",
      "---\nstatus: in-progress\n---\n# Progress\n\n## Build\n\nBuild summary.",
    );
    writeDoc(
      root,
      "reviews/topic-a.md",
      "---\nstatus: pass\nevidence_artifact_id: review-new\n---\n# Review\n\n## Result\n\nReview summary.",
    );
    writeDoc(
      root,
      "ship/topic-a-gates.json",
      JSON.stringify({ allPassed: true, gateArtifacts: ["review-new", "test-1"] }),
    );

    writeEvidenceArtifact(
      root,
      artifact({
        artifact_id: "review-old",
        result: "fail",
        created_at: "2026-06-09T01:00:00.000Z",
      }),
    );
    writeEvidenceArtifact(root, artifact({ supersedes: "review-old" }));
    writeEvidenceArtifact(
      root,
      artifact({
        artifact_id: "test-1",
        kind: "test",
        result: "pass",
        created_at: "2026-06-09T03:00:00.000Z",
      }),
    );

    const replay = buildEvidenceReplay("topic-a", join(root, ".tinkerman"));

    expect(replay.entries.map((entry) => entry.stage)).toEqual(
      expect.arrayContaining(["decide", "spec", "build", "review", "ship", "artifact"]),
    );
    expect(replay.entries).toContainEqual(
      expect.objectContaining({
        stage: "decide",
        source: "missing",
        summary: "No decisions evidence found for topic-a",
      }),
    );
    expect(replay.entries).toContainEqual(
      expect.objectContaining({
        stage: "review",
        artifactId: "review-new",
        citedArtifactIds: ["review-new"],
      }),
    );
    expect(replay.entries).toContainEqual(
      expect.objectContaining({
        stage: "test",
        artifactId: "test-1",
        citedArtifactIds: ["test-1"],
        result: "pass",
      }),
    );
    expect(replay.entries).toContainEqual(
      expect.objectContaining({
        stage: "ship",
        citedArtifactIds: ["review-new", "test-1"],
      }),
    );
    expect(replay.entries).toContainEqual(
      expect.objectContaining({
        stage: "artifact",
        artifactId: "review-old",
        result: "fail",
        superseded: true,
      }),
    );
    expect(replay.entries).toContainEqual(
      expect.objectContaining({
        stage: "artifact",
        artifactId: "test-1",
        result: "pass",
        superseded: false,
      }),
    );
  });

  it("renders fact, missing, and superseded states distinctly", () => {
    const root = tempRoot();
    writeEvidenceArtifact(root, artifact({ supersedes: "review-old" }));

    const output = renderReplayTimeline(buildEvidenceReplay("topic-a", join(root, ".tinkerman")));

    expect(output).toContain("# Evidence Replay: topic-a");
    expect(output).toContain("[missing] Decide");
    expect(output).toContain("[fact] Artifact review-new review pass");
    expect(output).toContain("cites review-new");
    expect(output).toContain("supersedes review-old");
  });
});
