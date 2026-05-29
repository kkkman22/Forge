import { chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FrozenZoneViolation, WorkflowAuditWriter } from "../src/workflow-audit-writer.js";
describe("WorkflowAuditWriter", () => {
    let tmpDir;
    let forgeRoot;
    beforeEach(() => {
        tmpDir = join(tmpdir(), `waw-test-${Date.now()}`);
        forgeRoot = join(tmpDir, ".forge");
        mkdirSync(forgeRoot, { recursive: true });
        mkdirSync(join(forgeRoot, "reviews"), { recursive: true });
        mkdirSync(join(forgeRoot, "decisions"), { recursive: true });
        mkdirSync(join(forgeRoot, "knowledge", "sessions"), { recursive: true });
    });
    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });
    const frozenChecker = (p) => p.includes("/specs/") || p.includes("/plans/") || p.endsWith("config.md");
    it("writes review to .forge/reviews/ and appends", async () => {
        const writer = new WorkflowAuditWriter(forgeRoot, frozenChecker);
        const existing = "# Existing review\n";
        writeFileSync(join(forgeRoot, "reviews", "topic.md"), existing);
        await writer.write({
            subcommand: "review",
            runId: "run-001",
            topic: "topic",
            payload: { methodology: "workflow", findings: ["f1"] },
        });
        const content = readFileSync(join(forgeRoot, "reviews", "topic.md"), "utf-8");
        expect(content.startsWith(existing)).toBe(true);
        expect(content).toContain("methodology");
    });
    it("writes decide to .forge/decisions/ with date-slug name", async () => {
        const writer = new WorkflowAuditWriter(forgeRoot, frozenChecker);
        await writer.write({
            subcommand: "decide",
            runId: "run-002",
            topic: "auth-strategy",
            payload: { decision: "use JWT" },
        });
        const dir = join(forgeRoot, "decisions");
        const files = readdirSync(dir);
        expect(files.length).toBe(1);
        expect(files[0]).toMatch(/^\d{4}-\d{2}-\d{2}-auth-strategy\.md$/);
    });
    it("writes learn to .forge/knowledge/sessions/", async () => {
        const writer = new WorkflowAuditWriter(forgeRoot, frozenChecker);
        await writer.write({
            subcommand: "learn",
            runId: "run-003",
            topic: "session",
            payload: { lessons: ["l1"] },
        });
        expect(existsSync(join(forgeRoot, "knowledge", "sessions", "run-003.md"))).toBe(true);
    });
    it("creates target directory if missing", async () => {
        const writer = new WorkflowAuditWriter(forgeRoot, frozenChecker);
        // Remove reviews dir
        rmSync(join(forgeRoot, "reviews"), { recursive: true });
        await writer.write({
            subcommand: "review",
            runId: "run-004",
            topic: "new-review",
            payload: { findings: [] },
        });
        expect(existsSync(join(forgeRoot, "reviews"))).toBe(true);
    });
    it("throws FrozenZoneViolation for locked spec paths", async () => {
        // Force the resolveDestPath to return a frozen path
        const writerWithFrozenPath = new WorkflowAuditWriter(forgeRoot, () => true);
        await expect(writerWithFrozenPath.write({
            subcommand: "review",
            runId: "run-005",
            topic: "frozen-topic",
            payload: {},
        })).rejects.toThrow(FrozenZoneViolation);
    });
    it("preserves existing content prefix on append", async () => {
        const writer = new WorkflowAuditWriter(forgeRoot, frozenChecker);
        const original = "# Original\n\nFinding 1 here.\n";
        writeFileSync(join(forgeRoot, "reviews", "append-test.md"), original);
        await writer.write({
            subcommand: "review",
            runId: "run-006",
            topic: "append-test",
            payload: { new_finding: true },
        });
        const updated = readFileSync(join(forgeRoot, "reviews", "append-test.md"), "utf-8");
        expect(updated.startsWith(original)).toBe(true);
        expect(updated.length).toBeGreaterThan(original.length);
    });
});
// ---------------------------------------------------------------------------
// R2.4: hookCheckFrozen support
// ---------------------------------------------------------------------------
describe("WorkflowAuditWriter hookCheckFrozen (R2.4)", () => {
    let tmpDir;
    let forgeRoot;
    let hookDir;
    beforeEach(() => {
        tmpDir = join(tmpdir(), `waw-hook-test-${Date.now()}`);
        forgeRoot = join(tmpDir, ".forge");
        hookDir = join(tmpDir, "scripts");
        mkdirSync(forgeRoot, { recursive: true });
        mkdirSync(join(forgeRoot, "reviews"), { recursive: true });
        mkdirSync(join(forgeRoot, "decisions"), { recursive: true });
        mkdirSync(join(forgeRoot, "knowledge", "sessions"), { recursive: true });
        mkdirSync(hookDir, { recursive: true });
    });
    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });
    const frozenChecker = () => false; // nothing frozen in these tests
    /** Helper: create a hook script that exits 0 (approve) */
    function makeApproveHook(name) {
        const path = join(hookDir, name);
        writeFileSync(path, "#!/bin/bash\nexit 0\n", "utf-8");
        chmodSync(path, 0o755);
        return path;
    }
    /** Helper: create a hook script that exits 1 (reject) with a message to stderr */
    function makeRejectHook(name, msg) {
        const path = join(hookDir, name);
        writeFileSync(path, `#!/bin/bash\necho "${msg}" >&2\nexit 1\n`, "utf-8");
        chmodSync(path, 0o755);
        return path;
    }
    /** Helper: create a hook script that records its $1 argument to a file */
    function makeRecordArgHook(name, recordFile) {
        const path = join(hookDir, name);
        writeFileSync(path, `#!/bin/bash\necho "$1" > "${recordFile}"\nexit 0\n`, "utf-8");
        chmodSync(path, 0o755);
        return path;
    }
    it("allows write when hook exits 0", async () => {
        const hookPath = makeApproveHook("approve-hook.sh");
        const writer = new WorkflowAuditWriter(forgeRoot, frozenChecker, hookPath);
        await expect(writer.write({
            subcommand: "review",
            runId: "run-hook-001",
            topic: "allowed-topic",
            payload: { ok: true },
        })).resolves.not.toThrow();
        expect(existsSync(join(forgeRoot, "reviews", "allowed-topic.md"))).toBe(true);
    });
    it("throws FrozenZoneViolation when hook exits 1", async () => {
        const hookPath = makeRejectHook("reject-hook.sh", "blocked by policy");
        const writer = new WorkflowAuditWriter(forgeRoot, frozenChecker, hookPath);
        await expect(writer.write({
            subcommand: "review",
            runId: "run-hook-002",
            topic: "blocked-topic",
            payload: {},
        })).rejects.toThrow(FrozenZoneViolation);
        // Verify the error message contains the hook rejection reason
        try {
            await writer.write({
                subcommand: "review",
                runId: "run-hook-002b",
                topic: "blocked-topic-b",
                payload: {},
            });
            expect.unreachable("Should have thrown");
        }
        catch (err) {
            expect(err).toBeInstanceOf(FrozenZoneViolation);
            const violation = err;
            expect(violation.paths[1]).toContain("hook rejected");
            expect(violation.paths[0]).toContain("blocked-topic-b");
        }
    });
    it("skips hook check when hookCheckPath is undefined (graceful degradation)", async () => {
        const writer = new WorkflowAuditWriter(forgeRoot, frozenChecker);
        await expect(writer.write({
            subcommand: "review",
            runId: "run-hook-003",
            topic: "no-hook-topic",
            payload: { data: 1 },
        })).resolves.not.toThrow();
        expect(existsSync(join(forgeRoot, "reviews", "no-hook-topic.md"))).toBe(true);
    });
    it("skips hook check when hookCheckPath points to non-existent file", async () => {
        const writer = new WorkflowAuditWriter(forgeRoot, frozenChecker, "/nonexistent/hook.sh");
        await expect(writer.write({
            subcommand: "review",
            runId: "run-hook-004",
            topic: "missing-hook-topic",
            payload: { data: 2 },
        })).resolves.not.toThrow();
        expect(existsSync(join(forgeRoot, "reviews", "missing-hook-topic.md"))).toBe(true);
    });
    it("passes correct destPath as argument to hook script", async () => {
        const recordFile = join(tmpDir, "arg-record.txt");
        const hookPath = makeRecordArgHook("record-hook.sh", recordFile);
        const writer = new WorkflowAuditWriter(forgeRoot, frozenChecker, hookPath);
        await writer.write({
            subcommand: "review",
            runId: "run-hook-005",
            topic: "arg-check-topic",
            payload: {},
        });
        const recordedArg = readFileSync(recordFile, "utf-8").trim();
        const expectedDest = join(forgeRoot, "reviews", "arg-check-topic.md");
        expect(recordedArg).toBe(expectedDest);
    });
});
//# sourceMappingURL=workflow-audit-writer.test.js.map