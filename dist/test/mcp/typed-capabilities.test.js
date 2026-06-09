import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeEvidenceArtifact } from "../../src/evidence-artifact.js";
import { legacyTypedReplacementWarning } from "../../src/mcp/tools/forge-exec.js";
import { registerTypedCapabilityTools, TYPED_CAPABILITY_TOOL_NAMES, } from "../../src/mcp/tools/typed-capabilities.js";
const tempRoots = [];
function tempRoot() {
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
function artifact(overrides = {}) {
    return {
        schema_version: 1,
        artifact_id: "artifact-1",
        kind: "review",
        topic: "topic-a",
        run_id: "run-1",
        commit: "head-1",
        result: "pass",
        producer: "vitest",
        created_at: "2026-06-09T01:00:00.000Z",
        ...overrides,
    };
}
describe("typed MCP capabilities", () => {
    it("registers all typed capability tools", () => {
        const registered = [];
        const fakeServer = {
            registerTool: (name) => {
                registered.push(name);
            },
        };
        registerTypedCapabilityTools(fakeServer, { path: "/repo" });
        expect(registered.sort()).toEqual([...TYPED_CAPABILITY_TOOL_NAMES].sort());
    });
    it("returns schema-shaped artifact query JSON", async () => {
        const root = tempRoot();
        writeEvidenceArtifact(root, artifact());
        const handlers = new Map();
        const fakeServer = {
            registerTool: (name, _schema, handler) => {
                handlers.set(name, handler);
            },
        };
        registerTypedCapabilityTools(fakeServer, { path: root });
        const result = (await handlers.get("forge_artifact_query")?.({ topic: "topic-a" }));
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.schema_version).toBe(1);
        expect(parsed.artifacts).toHaveLength(1);
        expect(parsed.artifacts[0]).toEqual(expect.objectContaining({
            artifact_id: "artifact-1",
            kind: "review",
            result: "pass",
        }));
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
//# sourceMappingURL=typed-capabilities.test.js.map