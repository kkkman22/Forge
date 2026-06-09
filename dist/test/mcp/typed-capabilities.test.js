import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeEvidenceArtifact } from "../../src/evidence-artifact.js";
import { legacyTypedReplacementWarning } from "../../src/mcp/tools/forge-exec.js";
import { preferredTypedCapabilitiesForConsumer, registerTypedCapabilityTools, TYPED_CAPABILITY_TOOL_NAMES, validateTypedCapabilityOutput, } from "../../src/mcp/tools/typed-capabilities.js";
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
    const base = {
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
function writeForgeFile(root, relPath, content) {
    const fullPath = join(root, ".forge", relPath);
    mkdirSync(join(fullPath, ".."), { recursive: true });
    writeFileSync(fullPath, content, "utf-8");
}
function collectHandlers(root) {
    const handlers = new Map();
    const fakeServer = {
        registerTool: (name, _schema, handler) => {
            handlers.set(name, handler);
        },
    };
    registerTypedCapabilityTools(fakeServer, root ? { path: root } : undefined);
    return handlers;
}
function parseToolResult(result) {
    return JSON.parse(result.content[0].text);
}
function writePackageScripts(root) {
    writeFileSync(join(root, "package.json"), JSON.stringify({
        scripts: {
            typecheck: "node -e \"console.log('typecheck ok')\"",
            test: "node -e \"console.log('test ok')\"",
            "docs:check": "node -e \"console.log('docs ok')\"",
            check: "node -e \"console.log('check ok')\"",
        },
    }, null, 2), "utf-8");
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
    it("registers tools against the current working directory by default", () => {
        const handlers = collectHandlers();
        expect([...handlers.keys()].sort()).toEqual([...TYPED_CAPABILITY_TOOL_NAMES].sort());
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
        expect(validateTypedCapabilityOutput("forge_artifact_query", parsed).success).toBe(true);
    });
    it("ignores non-string artifact filters and invalid evidence kinds", async () => {
        const root = tempRoot();
        writeEvidenceArtifact(root, artifact());
        const handlers = collectHandlers(root);
        const result = await handlers.get("forge_artifact_query")?.({
            topic: 123,
            kind: "not-a-kind",
            commit: ["head-1"],
            run_id: false,
        });
        const parsed = parseToolResult(result);
        expect(validateTypedCapabilityOutput("forge_artifact_query", parsed).success).toBe(true);
        expect(parsed.artifacts).toHaveLength(1);
    });
    it("returns schema-shaped review context JSON", async () => {
        const root = tempRoot();
        writeForgeFile(root, "status.md", '---\ncurrent_task: "topic-a"\ntier: "standard"\nphase: "build"\n---\n');
        const handlers = new Map();
        const fakeServer = {
            registerTool: (name, _schema, handler) => {
                handlers.set(name, handler);
            },
        };
        registerTypedCapabilityTools(fakeServer, { path: root });
        const result = (await handlers.get("forge_review_context")?.({ currentHead: "head-1" }));
        const parsed = JSON.parse(result.content[0].text);
        expect(parsed.health.task.id).toBe("topic-a");
        expect(parsed.diff.status).toBe("unknown");
        expect(validateTypedCapabilityOutput("forge_review_context", parsed).success).toBe(true);
    });
    it("runs typed check profiles and maps each profile to its command", async () => {
        const root = tempRoot();
        writePackageScripts(root);
        const handlers = collectHandlers(root);
        const checkCommand = handlers.get("forge_check_command");
        for (const [profile, command] of [
            ["typecheck", "npm run typecheck"],
            ["test", "npm test"],
            ["docs", "npm run docs:check"],
            ["check", "npm run check"],
        ]) {
            const parsed = parseToolResult((await checkCommand?.({ profile })));
            expect(parsed).toEqual(expect.objectContaining({
                schema_version: 1,
                profile,
                command,
                exit_code: 0,
                status: "pass",
                timed_out: false,
            }));
            expect(validateTypedCapabilityOutput("forge_check_command", parsed).success).toBe(true);
        }
    });
    it("returns failing typed check output for unknown profiles", async () => {
        const root = tempRoot();
        writePackageScripts(root);
        const handlers = collectHandlers(root);
        const parsed = parseToolResult((await handlers.get("forge_check_command")?.({ profile: "unknown" })));
        expect(parsed).toEqual(expect.objectContaining({
            schema_version: 1,
            profile: "unknown",
            command: "npm run check",
            status: "pass",
        }));
    });
    it("reports git diff summaries and dist-sync status for clean and dirty repos", async () => {
        const root = tempRoot();
        execFileSync("git", ["init"], { cwd: root, stdio: "ignore" });
        execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
        execFileSync("git", ["config", "user.name", "Test User"], { cwd: root });
        writeFileSync(join(root, "tracked.txt"), "before\n", "utf-8");
        mkdirSync(join(root, "dist"), { recursive: true });
        writeFileSync(join(root, "dist", "bundle.js"), "old\n", "utf-8");
        execFileSync("git", ["add", "."], { cwd: root });
        execFileSync("git", ["commit", "-m", "initial"], { cwd: root, stdio: "ignore" });
        const handlers = collectHandlers(root);
        let distSync = parseToolResult((await handlers.get("forge_dist_sync")?.({})));
        expect(distSync).toEqual(expect.objectContaining({ schema_version: 1, status: "pass" }));
        writeFileSync(join(root, "tracked.txt"), "before\nafter\n", "utf-8");
        writeFileSync(join(root, "dist", "bundle.js"), "new\n", "utf-8");
        const diff = parseToolResult((await handlers.get("forge_diff_summary")?.({})));
        expect(diff).toEqual(expect.objectContaining({ schema_version: 1, status: "pass" }));
        expect(diff.summary.files.some((file) => file.filePath === "tracked.txt")).toBe(true);
        distSync = parseToolResult((await handlers.get("forge_dist_sync")?.({})));
        expect(distSync).toEqual(expect.objectContaining({ schema_version: 1, status: "fail" }));
    });
    it("returns docs drift pass and fail statuses", async () => {
        const root = tempRoot();
        writePackageScripts(root);
        const handlers = collectHandlers(root);
        const pass = parseToolResult((await handlers.get("forge_docs_drift")?.({})));
        expect(pass).toEqual(expect.objectContaining({
            schema_version: 1,
            status: "pass",
            command: "npm run docs:check",
            exit_code: 0,
        }));
        writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { "docs:check": 'node -e "process.exit(1)"' } }, null, 2), "utf-8");
        const fail = parseToolResult((await handlers.get("forge_docs_drift")?.({})));
        expect(fail).toEqual(expect.objectContaining({
            schema_version: 1,
            status: "fail",
            command: "npm run docs:check",
            exit_code: 1,
        }));
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
//# sourceMappingURL=typed-capabilities.test.js.map