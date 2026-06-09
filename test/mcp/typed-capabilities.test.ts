import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type EvidenceArtifact, writeEvidenceArtifact } from "../../src/evidence-artifact.js";
import { legacyTypedReplacementWarning } from "../../src/mcp/tools/forge-exec.js";
import {
  preferredTypedCapabilitiesForConsumer,
  registerTypedCapabilityTools,
  TYPED_CAPABILITY_TOOL_NAMES,
  validateTypedCapabilityOutput,
} from "../../src/mcp/tools/typed-capabilities.js";

const tempRoots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "forge-mcp-typed-test-"));
  tempRoots.push(root);
  mkdirSync(join(root, ".forge"), { recursive: true });
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function artifact(overrides: Partial<EvidenceArtifact> = {}): EvidenceArtifact {
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

function writeForgeFile(root: string, relPath: string, content: string): void {
  const fullPath = join(root, ".forge", relPath);
  mkdirSync(join(fullPath, ".."), { recursive: true });
  writeFileSync(fullPath, content, "utf-8");
}

describe("typed MCP capabilities", () => {
  it("registers all typed capability tools", () => {
    const registered: string[] = [];
    const fakeServer = {
      registerTool: (name: string) => {
        registered.push(name);
      },
    };

    registerTypedCapabilityTools(fakeServer, { path: "/repo" });

    expect(registered.sort()).toEqual([...TYPED_CAPABILITY_TOOL_NAMES].sort());
  });

  it("returns schema-shaped artifact query JSON", async () => {
    const root = tempRoot();
    writeEvidenceArtifact(root, artifact());

    const handlers = new Map<string, (input: Record<string, unknown>) => Promise<unknown>>();
    const fakeServer = {
      registerTool: (
        name: string,
        _schema: unknown,
        handler: (input: Record<string, unknown>) => Promise<unknown>,
      ) => {
        handlers.set(name, handler);
      },
    };
    registerTypedCapabilityTools(fakeServer, { path: root });

    const result = (await handlers.get("forge_artifact_query")?.({ topic: "topic-a" })) as {
      content: Array<{ text: string }>;
    };
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.schema_version).toBe(1);
    expect(parsed.artifacts).toHaveLength(1);
    expect(parsed.artifacts[0]).toEqual(
      expect.objectContaining({
        artifact_id: "artifact-1",
        kind: "review",
        result: "pass",
      }),
    );
    expect(validateTypedCapabilityOutput("forge_artifact_query", parsed).success).toBe(true);
  });

  it("returns schema-shaped review context JSON", async () => {
    const root = tempRoot();
    writeForgeFile(
      root,
      "status.md",
      '---\ncurrent_task: "topic-a"\ntier: "standard"\nphase: "build"\n---\n',
    );

    const handlers = new Map<string, (input: Record<string, unknown>) => Promise<unknown>>();
    const fakeServer = {
      registerTool: (
        name: string,
        _schema: unknown,
        handler: (input: Record<string, unknown>) => Promise<unknown>,
      ) => {
        handlers.set(name, handler);
      },
    };
    registerTypedCapabilityTools(fakeServer, { path: root });

    const result = (await handlers.get("forge_review_context")?.({ currentHead: "head-1" })) as {
      content: Array<{ text: string }>;
    };
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.health.task.id).toBe("topic-a");
    expect(parsed.diff.status).toBe("unknown");
    expect(validateTypedCapabilityOutput("forge_review_context", parsed).success).toBe(true);
  });

  it("rejects typed outputs that do not match the tool schema", () => {
    const result = validateTypedCapabilityOutput("forge_docs_drift", {
      schema_version: 2,
      status: "pass",
      command: "npm run docs:check",
      exit_code: 0,
      stdout_tail: "",
      stderr_tail: "",
    });

    expect(result.success).toBe(false);
  });

  it("declares typed capability preferences for migrated consumers", () => {
    expect(preferredTypedCapabilitiesForConsumer("doctor")).toEqual([
      "forge_review_context",
      "forge_artifact_query",
      "forge_dist_sync",
      "forge_docs_drift",
    ]);
    expect(preferredTypedCapabilitiesForConsumer("status")).toEqual([
      "forge_review_context",
      "forge_artifact_query",
    ]);
    expect(preferredTypedCapabilitiesForConsumer("review")).toEqual([
      "forge_review_context",
      "forge_diff_summary",
    ]);
    expect(preferredTypedCapabilitiesForConsumer("ship")).toEqual([
      "forge_artifact_query",
      "forge_dist_sync",
      "forge_docs_drift",
    ]);
  });

  it("warns when forge_exec is used for checks with typed replacements", () => {
    expect(legacyTypedReplacementWarning("npm run docs:check")).toEqual({
      code: "LEGACY_TYPED_REPLACEMENT_AVAILABLE",
      replacement: "forge_docs_drift",
      message: "Typed MCP capability available: use forge_docs_drift instead of forge_exec.",
    });
    expect(legacyTypedReplacementWarning("npm run check-dist-sync")).toBeNull();
  });
});
