import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildHealthSnapshot, renderStatusSummary } from "../src/doctor.js";
import { type EvidenceArtifact, writeEvidenceArtifact } from "../src/evidence-artifact.js";

const tempRoots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "forge-doctor-test-"));
  tempRoots.push(root);
  mkdirSync(join(root, ".forge"), { recursive: true });
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function writeForgeFile(root: string, relPath: string, content: string): void {
  const fullPath = join(root, ".forge", relPath);
  mkdirSync(join(fullPath, ".."), { recursive: true });
  writeFileSync(fullPath, content, "utf-8");
}

function artifact(overrides: Partial<EvidenceArtifact>): EvidenceArtifact {
  const base: EvidenceArtifact = {
    schema_version: 1,
    artifact_id: "artifact-1",
    kind: "review",
    topic: "topic-a",
    run_id: "run-1",
    trace_id: "run-1",
    commit: "head-1",
    command: "npm run check",
    exit_code: 0,
    input_hash: "hash-1",
    result: "pass",
    producer: "vitest",
    created_at: "2026-06-09T01:00:00.000Z",
  };
  return Object.assign(base, overrides);
}

describe("doctor health snapshot", () => {
  it("reports unknown instead of pass when status is missing", () => {
    const root = tempRoot();
    const snapshot = buildHealthSnapshot({ projectRoot: root, currentHead: "head-1" });

    expect(snapshot.task.id).toBe("unknown");
    expect(snapshot.gates.status.status).toBe("unknown");
    expect(snapshot.nextStep.allowed).toBe(false);
    expect(snapshot.nextStep.reasons).toContainEqual(
      expect.objectContaining({ code: "STATUS_UNKNOWN" }),
    );
  });

  it("includes the full status explainability dimensions", () => {
    const root = tempRoot();
    writeForgeFile(
      root,
      "status.md",
      '---\ncurrent_task: "topic-a"\ntier: "standard"\nphase: "test"\n---\n',
    );
    writeForgeFile(root, "specs/topic-a/requirements.md", '---\nstatus: "locked"\n---\n');
    writeForgeFile(root, "plans/topic-a.md", '---\nstatus: "approved"\n---\n');
    writeForgeFile(root, "progress/topic-a.md", "- [x] first\n- [ ] second\n");
    writeEvidenceArtifact(root, artifact({ kind: "review", commit: "head-1" }));
    writeEvidenceArtifact(
      root,
      artifact({
        artifact_id: "test-1",
        kind: "test",
        commit: "old-head",
      }),
    );
    writeEvidenceArtifact(
      root,
      artifact({
        artifact_id: "ship-1",
        kind: "ship_gate",
        commit: "head-1",
        result: "blocked",
      }),
    );

    const snapshot = buildHealthSnapshot({
      projectRoot: root,
      currentHead: "head-1",
      generatedAt: "2026-06-09T00:00:00.000Z",
    });

    expect(snapshot.branch.status).toBe("unknown");
    expect(snapshot.worktree.status).toBe("unknown");
    expect(snapshot.spec).toEqual(
      expect.objectContaining({
        status: "pass",
        message: "Spec status is locked",
        source: ".forge/specs/topic-a/requirements.md",
      }),
    );
    expect(snapshot.plan).toEqual(
      expect.objectContaining({
        status: "pass",
        message: "Plan status is approved",
      }),
    );
    expect(snapshot.progress).toEqual(
      expect.objectContaining({
        status: "warn",
        total: 2,
        completed: 1,
      }),
    );
    expect(snapshot.freshness.review.status).toBe("pass");
    expect(snapshot.freshness.test.status).toBe("fail");
    expect(snapshot.shipGate.status).toBe("fail");
    expect(snapshot.distSync.status).toBe("unknown");
    expect(snapshot.docsDrift.status).toBe("unknown");
    expect(snapshot.toolHealth.status).toBe("unknown");
  });

  it("explains enterprise ship blockers from missing and stale artifacts", () => {
    const root = tempRoot();
    writeForgeFile(
      root,
      "status.md",
      '---\ncurrent_task: "topic-a"\ntier: "standard"\nphase: "test"\n---\n',
    );
    writeForgeFile(root, "config.md", "policy_profile: enterprise\n");
    writeEvidenceArtifact(
      root,
      artifact({
        artifact_id: "review-old",
        kind: "review",
        commit: "old-head",
      }),
    );

    const snapshot = buildHealthSnapshot({ projectRoot: root, currentHead: "head-2" });

    expect(snapshot.policyProfile).toBe("enterprise");
    expect(snapshot.nextStep.phase).toBe("ship");
    expect(snapshot.nextStep.allowed).toBe(false);
    expect(snapshot.nextStep.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "STALE_ARTIFACT",
          source: ".forge/artifacts",
        }),
        expect.objectContaining({
          code: "MISSING_ARTIFACT",
          source: ".forge/artifacts",
          detail: "required test artifact is missing",
        }),
        expect.objectContaining({
          code: "MISSING_ARTIFACT",
          source: ".forge/artifacts",
          detail: "required mutation artifact is missing",
        }),
      ]),
    );
  });

  it("renders concise status with active profile and blocker reasons", () => {
    const root = tempRoot();
    writeForgeFile(
      root,
      "status.md",
      '---\ncurrent_task: "topic-a"\ntier: "standard"\nphase: "test"\n---\n',
    );
    writeForgeFile(root, "config.md", "policy_profile: enterprise\n");

    const rendered = renderStatusSummary(
      buildHealthSnapshot({ projectRoot: root, currentHead: "h" }),
    );

    expect(rendered).toContain("Task: topic-a");
    expect(rendered).toContain("Profile: enterprise");
    expect(rendered).toContain("Next: ship blocked");
    expect(rendered).toContain("MISSING_ARTIFACT");
  });
});
