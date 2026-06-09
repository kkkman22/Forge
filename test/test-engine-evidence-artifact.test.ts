import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { queryEvidenceArtifacts } from "../src/evidence-artifact.js";
import { buildTestLayerFailedContext, persistTestEvidenceArtifact } from "../src/test-engine.js";

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

  it("builds failure contexts with and without failed cases", () => {
    expect(
      buildTestLayerFailedContext({
        topic: "topic-a",
        tier: "standard",
        failedLayer: "unit",
      }),
    ).toEqual({
      skill: "forge-test",
      topic: "topic-a",
      tier: "standard",
      trigger: "test_layer_failed",
      situation: "unit 验证失败",
      rootCause: "unit 失败",
    });

    expect(
      buildTestLayerFailedContext({
        topic: "topic-a",
        tier: "full",
        failedLayer: "browser",
        failedCases: ["case-a", "case-b"],
      }),
    ).toEqual({
      skill: "forge-test",
      topic: "topic-a",
      tier: "full",
      trigger: "test_layer_failed",
      situation: "browser 验证失败，失败用例：case-a、case-b",
      rootCause: "browser 失败，失败用例：case-a、case-b",
    });
  });

  it("uses default artifact fields and records failed test results", () => {
    const root = mkdtempSync(join(tmpdir(), "forge-test-artifact-defaults-"));
    try {
      const result = persistTestEvidenceArtifact(root, {
        topic: "!!!",
        commit: "head456",
        command: "npm test",
        exitCode: 1,
        stdoutTail: "failed",
        stderrTail: "boom",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.artifactId).toMatch(/^test-artifact-/);

      const artifacts = queryEvidenceArtifacts(root, { kind: "test" });
      expect(artifacts[0]).toMatchObject({
        topic: "!!!",
        commit: "head456",
        command: "npm test",
        exit_code: 1,
        stdout_tail: "failed",
        stderr_tail: "boom",
        result: "fail",
        producer: "forge-test",
      });
      expect(artifacts[0].run_id).toBe(result.artifactId);
      expect(artifacts[0].trace_id).toBe(result.artifactId);
      expect(artifacts[0].input_hash).toHaveLength(64);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("preserves explicit input hash and returns writer failures", () => {
    const root = mkdtempSync(join(tmpdir(), "forge-test-artifact-failure-"));
    try {
      const input = {
        topic: "test-failure",
        commit: "head789",
        command: "npm run check",
        exitCode: 0,
        inputHash: "explicit-hash",
        artifactId: "test-dup",
        runId: "run-dup",
        createdAt: "2026-06-09T02:00:00.000Z",
      };
      const first = persistTestEvidenceArtifact(root, input);
      expect(first.ok).toBe(true);
      expect(queryEvidenceArtifacts(root, { topic: "test-failure" })[0]).toMatchObject({
        input_hash: "explicit-hash",
        producer: "forge-test",
        result: "pass",
      });

      expect(persistTestEvidenceArtifact(root, input)).toEqual({
        ok: false,
        code: "ARTIFACT_ALREADY_EXISTS",
        message: "Evidence artifact already exists: test-dup",
      });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
