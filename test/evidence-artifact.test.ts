import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  type EvidenceArtifact,
  isArtifactFreshForCommit,
  queryEvidenceArtifacts,
  validateArtifactBackedVerdict,
  validateEvidenceArtifact,
  writeEvidenceArtifact,
} from "../src/evidence-artifact.js";

const tempRoots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "forge-artifact-test-"));
  tempRoots.push(root);
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("validateArtifactBackedVerdict", () => {
  it("rejects pass verdicts without an artifact reference", () => {
    const diagnostics = validateArtifactBackedVerdict(
      "---\nresult: pass\n---\n# Verdict\n\nPassed.",
    );

    expect(diagnostics).toContainEqual({
      code: "MISSING_ARTIFACT_REFERENCE",
      message: "pass verdicts must reference artifact_id or evidence_artifact_id",
    });
  });

  it("accepts pass verdicts with artifact_id or evidence_artifact_id", () => {
    expect(
      validateArtifactBackedVerdict("---\nresult: pass\nartifact_id: review-1\n---\n"),
    ).toEqual([]);
    expect(
      validateArtifactBackedVerdict("---\nresult: pass\nevidence_artifact_id: verify-1\n---\n"),
    ).toEqual([]);
  });

  it("does not require artifact references for non-pass verdicts", () => {
    expect(validateArtifactBackedVerdict("---\nresult: fail\n---\n")).toEqual([]);
  });
});

function artifact(overrides: Partial<EvidenceArtifact> = {}): EvidenceArtifact {
  return {
    schema_version: 1,
    artifact_id: "artifact-1",
    kind: "review",
    topic: "feature-a",
    run_id: "run-1",
    trace_id: "trace-1",
    commit: "abc123",
    command: "npm test",
    exit_code: 0,
    stdout_tail: "ok",
    stderr_tail: "",
    input_hash: "hash-1",
    result: "pass",
    producer: "vitest",
    created_at: "2026-06-09T01:00:00.000Z",
    ...overrides,
  };
}

describe("evidence artifact schema", () => {
  it("accepts complete artifact records", () => {
    expect(validateEvidenceArtifact(artifact())).toEqual([]);
  });

  it("rejects records without commit or timestamp", () => {
    const diagnostics = validateEvidenceArtifact(
      artifact({ commit: "", created_at: "" }) as EvidenceArtifact,
    );
    expect(diagnostics.map((d) => d.code)).toEqual(
      expect.arrayContaining(["MISSING_COMMIT", "MISSING_TIMESTAMP"]),
    );
  });

  it("rejects unsupported kind and result values", () => {
    const diagnostics = validateEvidenceArtifact({
      ...artifact(),
      kind: "lint",
      result: "ok",
    } as unknown as EvidenceArtifact);
    expect(diagnostics.map((d) => d.code)).toEqual(
      expect.arrayContaining(["INVALID_KIND", "INVALID_RESULT"]),
    );
  });
});

describe("immutable artifact writer and index", () => {
  it("writes deterministic JSON and appends an index record", () => {
    const root = tempRoot();
    const result = writeEvidenceArtifact(root, artifact());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const written = readFileSync(result.path, "utf-8");
    expect(written).toContain('"artifact_id": "artifact-1"');
    expect(written.endsWith("\n")).toBe(true);

    const index = readFileSync(join(root, ".forge", "artifacts", "index.jsonl"), "utf-8");
    expect(index).toContain('"artifact_id":"artifact-1"');
    expect(index).toContain('"kind":"review"');
  });

  it("refuses to overwrite an existing artifact id", () => {
    const root = tempRoot();
    expect(writeEvidenceArtifact(root, artifact()).ok).toBe(true);

    const duplicate = writeEvidenceArtifact(root, artifact({ result: "fail" }));
    expect(duplicate).toEqual({
      ok: false,
      code: "ARTIFACT_ALREADY_EXISTS",
      message: "Evidence artifact already exists: artifact-1",
    });
  });

  it("queries latest artifacts by topic, kind, and commit", () => {
    const root = tempRoot();
    writeEvidenceArtifact(
      root,
      artifact({ artifact_id: "old", created_at: "2026-06-09T01:00:00.000Z" }),
    );
    writeEvidenceArtifact(
      root,
      artifact({
        artifact_id: "new",
        kind: "test",
        commit: "def456",
        created_at: "2026-06-09T02:00:00.000Z",
      }),
    );

    expect(queryEvidenceArtifacts(root, { topic: "feature-a" }).map((a) => a.artifact_id)).toEqual([
      "new",
      "old",
    ]);
    expect(queryEvidenceArtifacts(root, { kind: "test" }).map((a) => a.artifact_id)).toEqual([
      "new",
    ]);
    expect(queryEvidenceArtifacts(root, { commit: "abc123" }).map((a) => a.artifact_id)).toEqual([
      "old",
    ]);
  });

  it("marks same-commit artifacts fresh and older commit artifacts stale", () => {
    expect(isArtifactFreshForCommit(artifact({ commit: "abc123" }), "abc123")).toEqual({
      fresh: true,
      reason: "artifact commit matches current HEAD",
    });
    expect(isArtifactFreshForCommit(artifact({ commit: "abc123" }), "def456")).toEqual({
      fresh: false,
      reason: "artifact commit abc123 does not match current HEAD def456",
    });
  });
});
