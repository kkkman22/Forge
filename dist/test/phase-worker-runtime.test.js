import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCliSdkWorkerArgs, buildSubagentWorkerInvocation, normalizeWorkerSummary, runCliSdkWorker, runSubagentWorker, } from "../src/phase-worker-runtime.js";
describe("phase-worker-runtime", () => {
    let root;
    beforeEach(() => {
        root = join(tmpdir(), `forge-phase-worker-${Date.now()}`);
        mkdirSync(root, { recursive: true });
    });
    afterEach(() => {
        rmSync(root, { recursive: true, force: true });
    });
    function request() {
        return {
            phase: "review",
            runId: "run-001",
            projectRoot: root,
            prompt: "Run three-layer review.",
            artifactPath: join(root, ".forge", "runs", "run-001", "workers", "review.md"),
            summaryPath: join(root, ".forge", "runs", "run-001", "workers", "review.json"),
            nextAction: "test",
        };
    }
    it("normalizes summaries with field-level bounds", () => {
        const normalized = normalizeWorkerSummary({
            phase: "review",
            worker_kind: "subagent",
            status: "success",
            summary: "x".repeat(1200),
            artifact_path: ".forge/runs/run-001/workers/review.md",
            commands: [
                { cmd: "a", result: "pass", evidence_path: "a.log" },
                { cmd: "b", result: "pass", evidence_path: "b.log" },
                { cmd: "c", result: "pass", evidence_path: "c.log" },
                { cmd: "d", result: "pass", evidence_path: "d.log" },
            ],
            findings: {
                p0: 0,
                p1: 4,
                items: [
                    { severity: "P1", summary: "one", evidence_path: "1.md" },
                    { severity: "P1", summary: "two", evidence_path: "2.md" },
                    { severity: "P1", summary: "three", evidence_path: "3.md" },
                    { severity: "P1", summary: "four", evidence_path: "4.md" },
                ],
            },
            next_action: "test",
        });
        expect(normalized.summary.length).toBeLessThanOrEqual(600);
        expect(normalized.commands).toHaveLength(3);
        expect(normalized.findings.items).toHaveLength(3);
    });
    it("normalizes malformed worker summaries to bounded safe defaults", () => {
        const normalized = normalizeWorkerSummary({
            phase: "unknown",
            worker_kind: "other",
            status: "maybe",
            commands: [
                null,
                { cmd: null, result: "unexpected", evidence_path: undefined },
                { cmd: "failed command", result: "fail", evidence_path: "failure.log" },
            ],
            findings: {
                p0: -1,
                p1: "many",
                items: [
                    null,
                    { severity: "critical", summary: undefined, evidence_path: null },
                    { severity: "P0", summary: "real finding", evidence_path: "finding.md" },
                ],
            },
            next_action: undefined,
        });
        expect(normalized.phase).toBe("build");
        expect(normalized.worker_kind).toBe("cli-sdk");
        expect(normalized.status).toBe("failed");
        expect(normalized.commands).toEqual([
            { cmd: "", result: "skipped", evidence_path: "" },
            { cmd: "failed command", result: "fail", evidence_path: "failure.log" },
        ]);
        expect(normalized.findings).toEqual({
            p0: 0,
            p1: 0,
            items: [
                { severity: "P3", summary: "", evidence_path: "" },
                { severity: "P0", summary: "real finding", evidence_path: "finding.md" },
            ],
        });
        expect(normalized.next_action).toBe("");
    });
    it("builds a subagent invocation with artifact-first contract", () => {
        const invocation = buildSubagentWorkerInvocation(request(), "quality-check");
        expect(invocation.agentType).toBe("quality-check");
        expect(invocation.prompt).toContain("Run three-layer review.");
        expect(invocation.prompt).toContain(request().artifactPath);
        expect(invocation.prompt).toContain("bounded JSON summary");
        expect(invocation.permissionMode).toBe("default");
    });
    it("runs a subagent worker and normalizes the returned summary", async () => {
        const executor = vi.fn().mockResolvedValue({
            agentType: "quality-check",
            status: "success",
            output: JSON.stringify({
                phase: "review",
                worker_kind: "subagent",
                status: "success",
                summary: "review complete",
                artifact_path: request().artifactPath,
                commands: [],
                findings: { p0: 0, p1: 0, items: [] },
                next_action: "test",
            }),
        });
        const result = await runSubagentWorker(request(), {
            agentType: "quality-check",
            executor,
        });
        expect(executor).toHaveBeenCalledOnce();
        expect(result.status).toBe("success");
        expect(result.worker_kind).toBe("subagent");
        expect(result.artifact_path).toBe(request().artifactPath);
    });
    it("returns a failed subagent summary when the worker fails without output", async () => {
        const result = await runSubagentWorker(request(), {
            agentType: "quality-check",
            executor: vi.fn().mockResolvedValue({
                agentType: "quality-check",
                status: "failed",
                error: "review worker unavailable",
            }),
        });
        expect(result.status).toBe("failed");
        expect(result.worker_kind).toBe("subagent");
        expect(result.summary).toContain("review worker unavailable");
    });
    it("returns a failed subagent summary when the worker output is malformed JSON", async () => {
        const result = await runSubagentWorker(request(), {
            agentType: "quality-check",
            executor: vi.fn().mockResolvedValue({
                agentType: "quality-check",
                status: "success",
                output: "{not-json",
            }),
        });
        expect(result.status).toBe("failed");
        expect(result.worker_kind).toBe("subagent");
        expect(result.summary).toContain("malformed JSON");
    });
    it("builds CLI/SDK worker args with artifact and summary paths", () => {
        const args = buildCliSdkWorkerArgs(request(), "scripts/forge-phase-worker.mjs");
        expect(args).toEqual([
            "scripts/forge-phase-worker.mjs",
            "--phase",
            "review",
            "--run-id",
            "run-001",
            "--project-root",
            root,
            "--artifact",
            request().artifactPath,
            "--summary",
            request().summaryPath,
        ]);
    });
    it("runs a CLI/SDK worker by reading its summary file", async () => {
        const req = request();
        const executor = vi.fn().mockImplementation(async () => {
            mkdirSync(join(root, ".forge", "runs", "run-001", "workers"), { recursive: true });
            writeFileSync(req.artifactPath, "# Review\n");
            writeFileSync(req.summaryPath, JSON.stringify({
                phase: "review",
                worker_kind: "cli-sdk",
                status: "success",
                summary: "cli worker complete",
                artifact_path: req.artifactPath,
                commands: [],
                findings: { p0: 0, p1: 0, items: [] },
                next_action: "test",
            }));
            return { exitCode: 0 };
        });
        const result = await runCliSdkWorker(req, {
            command: "node",
            script: "scripts/forge-phase-worker.mjs",
            executor,
        });
        expect(result.status).toBe("success");
        expect(result.worker_kind).toBe("cli-sdk");
        expect(existsSync(req.artifactPath)).toBe(true);
        expect(readFileSync(req.summaryPath, "utf-8")).toContain("cli worker complete");
    });
    it("runs a CLI/SDK worker with the default process executor", async () => {
        const req = request();
        const script = join(import.meta.dirname, "..", "scripts", "forge-phase-worker.mjs");
        const result = await runCliSdkWorker(req, {
            command: process.execPath,
            script,
        });
        expect(result.status).toBe("success");
        expect(result.worker_kind).toBe("cli-sdk");
        expect(readFileSync(req.artifactPath, "utf-8")).toContain("phase: review");
    });
    it("returns a failed CLI/SDK summary when no summary file is produced", async () => {
        const result = await runCliSdkWorker(request(), {
            command: "node",
            script: "scripts/forge-phase-worker.mjs",
            executor: vi.fn().mockResolvedValue({ exitCode: 0 }),
        });
        expect(result.status).toBe("failed");
        expect(result.worker_kind).toBe("cli-sdk");
        expect(result.summary).toContain("summary file was not produced");
    });
    it("returns a failed CLI/SDK summary when the worker exits non-zero", async () => {
        const req = request();
        const executor = vi.fn().mockImplementation(async () => {
            mkdirSync(join(root, ".forge", "runs", "run-001", "workers"), { recursive: true });
            writeFileSync(req.summaryPath, JSON.stringify({
                phase: "review",
                worker_kind: "cli-sdk",
                status: "success",
                summary: "stale success",
                artifact_path: req.artifactPath,
                commands: [],
                findings: { p0: 0, p1: 0, items: [] },
                next_action: "test",
            }));
            return { exitCode: 2, stderr: "worker failed" };
        });
        const result = await runCliSdkWorker(req, {
            command: "node",
            script: "scripts/forge-phase-worker.mjs",
            executor,
        });
        expect(result.status).toBe("failed");
        expect(result.worker_kind).toBe("cli-sdk");
        expect(result.summary).toContain("worker failed");
    });
    it("returns stdout in failed CLI/SDK summary when stderr is empty", async () => {
        const result = await runCliSdkWorker(request(), {
            command: "node",
            script: "scripts/forge-phase-worker.mjs",
            executor: vi.fn().mockResolvedValue({ exitCode: 2, stdout: "stdout failure" }),
        });
        expect(result.status).toBe("failed");
        expect(result.summary).toContain("stdout failure");
    });
    it("returns a failed CLI/SDK summary when the summary file is invalid JSON", async () => {
        const req = request();
        const executor = vi.fn().mockImplementation(async () => {
            mkdirSync(join(root, ".forge", "runs", "run-001", "workers"), { recursive: true });
            writeFileSync(req.summaryPath, "{not-json");
            return { exitCode: 0 };
        });
        const result = await runCliSdkWorker(req, {
            command: "node",
            script: "scripts/forge-phase-worker.mjs",
            executor,
        });
        expect(result.status).toBe("failed");
        expect(result.summary).toContain("summary file is invalid");
    });
});
//# sourceMappingURL=phase-worker-runtime.test.js.map