import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { queryEvidenceArtifacts } from "../src/evidence-artifact.js";
import { persistMutationEvidenceArtifact } from "../src/mutate.js";
const roots = [];
function tempRoot() {
    const root = mkdtempSync(join(tmpdir(), "forge-mutation-artifact-test-"));
    roots.push(root);
    return root;
}
function summary(overrides = {}) {
    return {
        packSource: "pms",
        targetedGlobs: ["src/ship-gates.ts"],
        targetGroups: ["gate_core"],
        required: true,
        total: 2,
        killed: 2,
        survived: 0,
        noCoverage: 0,
        runtimeErrors: 0,
        mutationScore: 100,
        threshold: 80,
        verdict: "pass",
        durationMs: 1200,
        ...overrides,
    };
}
afterEach(() => {
    for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
    }
});
describe("persistMutationEvidenceArtifact", () => {
    it("writes immutable mutation artifact and appends the artifact index", () => {
        const root = tempRoot();
        const result = persistMutationEvidenceArtifact(root, summary(), {
            runId: "run-1",
            artifactId: "mutation-1",
            commit: "head-1",
            createdAt: "2026-06-09T05:00:00.000Z",
        });
        expect(result.ok).toBe(true);
        if (!result.ok)
            return;
        const artifact = JSON.parse(readFileSync(result.path, "utf-8"));
        expect(artifact.kind).toBe("mutation");
        expect(artifact.topic).toBe("gate_core");
        expect(artifact.run_id).toBe("run-1");
        expect(artifact.commit).toBe("head-1");
        expect(artifact.result).toBe("pass");
        expect(artifact.input_hash).toBeDefined();
        const queried = queryEvidenceArtifacts(root, { topic: "gate_core", kind: "mutation" });
        expect(queried).toHaveLength(1);
        expect(queried[0].artifact_id).toBe("mutation-1");
    });
});
//# sourceMappingURL=mutate-evidence-artifact.test.js.map