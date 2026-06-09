import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { queryEvidenceArtifacts } from "../src/evidence-artifact.js";
import { persistTestEvidenceArtifact } from "../src/test-engine.js";

describe("persistTestEvidenceArtifact", () => {
  it("writes a test artifact and returns an id for test output", () => {
    const root = mkdtempSync(join(tmpdir(), "forge-test-artifact-"));
    try {
      const result = persistTestEvidenceArtifact(root, {
        topic: "immutable-evidence-artifacts",
        commit: "head123",
        command: "npm run check",
        exitCode: 0,
        stdoutTail: "Test Files 631 passed\nTests 7481 passed",
        stderrTail: "",
        runId: "run-1",
        artifactId: "test-1",
        createdAt: "2026-06-09T01:00:00.000Z",
        producer: "forge-test",
      });

      expect(result.ok).toBe(true);
      expect(result.ok ? result.artifactId : "").toBe("test-1");

      const artifacts = queryEvidenceArtifacts(root, {
        topic: "immutable-evidence-artifacts",
        kind: "test",
      });
      expect(artifacts).toHaveLength(1);
      expect(artifacts[0]).toMatchObject({
        artifact_id: "test-1",
        command: "npm run check",
        exit_code: 0,
        result: "pass",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
