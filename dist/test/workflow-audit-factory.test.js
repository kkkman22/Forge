import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuditWriter } from "../src/workflow-audit-factory.js";
import { WorkflowAuditWriter } from "../src/workflow-audit-writer.js";
describe("createAuditWriter (R2 production wiring)", () => {
    let tmpDir;
    let forgeRoot;
    beforeEach(() => {
        tmpDir = join(tmpdir(), `audit-factory-${Date.now()}`);
        forgeRoot = join(tmpDir, ".forge");
        mkdirSync(forgeRoot, { recursive: true });
    });
    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });
    it("returns a WorkflowAuditWriter instance", () => {
        const writer = createAuditWriter(forgeRoot);
        expect(writer).toBeInstanceOf(WorkflowAuditWriter);
    });
    it("successfully writes a review audit record", async () => {
        const writer = createAuditWriter(forgeRoot);
        await writer.write({
            subcommand: "review",
            runId: "run-001",
            topic: "my-topic",
            payload: { findings: ["issue-1"] },
        });
        const filePath = join(forgeRoot, "reviews", "my-topic.md");
        expect(existsSync(filePath)).toBe(true);
        const content = readFileSync(filePath, "utf-8");
        expect(content).toContain("run-001");
        expect(content).toContain("review");
    });
    it("successfully writes a decide audit record", async () => {
        const writer = createAuditWriter(forgeRoot);
        await writer.write({
            subcommand: "decide",
            runId: "run-002",
            topic: "auth-approach",
            payload: { decision: "jwt" },
        });
        const decisionsDir = join(forgeRoot, "decisions");
        const files = readdirSync(decisionsDir);
        expect(files.length).toBe(1);
        const content = readFileSync(join(decisionsDir, files[0]), "utf-8");
        expect(content).toContain("decide");
        expect(content).toContain("run-002");
    });
    it("successfully writes a learn audit record", async () => {
        const writer = createAuditWriter(forgeRoot);
        await writer.write({
            subcommand: "learn",
            runId: "run-003",
            topic: "session-summary",
            payload: { lessons: ["pattern-A"] },
        });
        const filePath = join(forgeRoot, "knowledge", "sessions", "run-003.md");
        expect(existsSync(filePath)).toBe(true);
        const content = readFileSync(filePath, "utf-8");
        expect(content).toContain("learn");
    });
});
//# sourceMappingURL=workflow-audit-factory.test.js.map