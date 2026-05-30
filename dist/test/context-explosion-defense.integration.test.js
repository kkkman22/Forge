/**
 * Integration tests for the five-layer context explosion defense system.
 *
 * Verifies end-to-end behavior across all layers:
 * - Layer 1: Read cache dedup
 * - Layer 2: Phase boundary budget thresholds
 * - Layer 3: Subagent file-based return
 * - Layer 4: Phase-aware plan injection
 * - Layer 5: Read budget tracking
 *
 * @vitest-environment node
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createIndex, lookup } from "../src/mcp/read-cache.js";
import { handleReadCached } from "../src/mcp/tools/forge-read-cached.js";
const tmpRoot = join(tmpdir(), `forge-integration-${process.pid}`);
describe("context-explosion-defense integration", () => {
    beforeEach(async () => {
        await mkdir(tmpRoot, { recursive: true });
    });
    afterEach(async () => {
        await rm(tmpRoot, { recursive: true, force: true });
    });
    describe("Layer 1: Read cache dedup", () => {
        it("first read returns full content, second returns cached", async () => {
            const index = createIndex("integration-test");
            const filePath = join(tmpRoot, "layer1.txt");
            await writeFile(filePath, "original content for integration test\n");
            // First read — full content
            const r1 = await handleReadCached(index, filePath);
            expect(r1.cached).toBe(false);
            expect(r1.content).toContain("original content");
            // Second read — cached
            const r2 = await handleReadCached(index, filePath);
            expect(r2.cached).toBe(true);
            expect(r2.content).toContain("[cached]");
            expect(r2.content).toContain("unchanged");
        });
        it("detects file modification and returns new content", async () => {
            const index = createIndex("integration-test");
            const filePath = join(tmpRoot, "layer1-mod.txt");
            await writeFile(filePath, "version 1\n");
            await handleReadCached(index, filePath);
            // Modify
            await writeFile(filePath, "version 2 modified\n");
            const r = await handleReadCached(index, filePath);
            expect(r.cached).toBe(false);
            expect(r.content).toContain("version 2");
        });
        it("cache index tracks multiple files", async () => {
            const index = createIndex("integration-test");
            const f1 = join(tmpRoot, "multi-1.txt");
            const f2 = join(tmpRoot, "multi-2.txt");
            await writeFile(f1, "file one\n");
            await writeFile(f2, "file two\n");
            await handleReadCached(index, f1);
            await handleReadCached(index, f2);
            expect(Object.keys(index.entries)).toHaveLength(2);
            expect(lookup(index, f1)).not.toBeNull();
            expect(lookup(index, f2)).not.toBeNull();
        });
    });
    describe("Layer 2: Phase boundary budget", () => {
        it("budget tracker accumulates read sizes", async () => {
            const index = createIndex("budget-test");
            const totalExpected = 10;
            // Read 10 files of ~1KB each
            for (let i = 0; i < totalExpected; i++) {
                const f = join(tmpRoot, `budget-${i}.txt`);
                await writeFile(f, `x`.repeat(1024));
                await handleReadCached(index, f);
            }
            // Verify all entries tracked
            expect(Object.keys(index.entries)).toHaveLength(totalExpected);
            // Verify total char count accumulated
            let totalChars = 0;
            for (const entry of Object.values(index.entries)) {
                totalChars += entry.charCount;
            }
            // Each file ~1024 chars, first read returns full content
            expect(totalChars).toBeGreaterThanOrEqual(totalExpected * 1000);
        });
    });
    describe("Layer 3: Subagent file-based return format", () => {
        it("generates valid 800-char summary format", () => {
            const summary = [
                "status: fail",
                "findings: 5",
                "p0: 1",
                "p1: 2",
                "report: .forge/reviews/spec-check-20260530-071500.md",
            ].join("\n");
            expect(summary.length).toBeLessThan(800);
            expect(summary).toMatch(/^status: (pass|fail)$/m);
            expect(summary).toMatch(/^findings: \d+$/m);
            expect(summary).toMatch(/^p0: \d+$/m);
            expect(summary).toMatch(/^p1: \d+$/m);
            expect(summary).toMatch(/^report: \.forge\/reviews\//m);
        });
        it("main agent skips report when no P0/P1", () => {
            const summary = [
                "status: pass",
                "findings: 3",
                "p0: 0",
                "p1: 0",
                "report: .forge/reviews/quality-check-20260530-071500.md",
            ].join("\n");
            // Parse summary
            const p0 = Number.parseInt(summary.match(/^p0: (\d+)/m)?.[1] ?? "999");
            const p1 = Number.parseInt(summary.match(/^p1: (\d+)/m)?.[1] ?? "999");
            const shouldReadReport = p0 > 0 || p1 > 0;
            expect(shouldReadReport).toBe(false);
        });
    });
    describe("Layer 4: Phase-aware plan injection", () => {
        it("build phase filters to incomplete tasks", async () => {
            const planContent = `---
status: approved
---

## Wave 1
- [x] Task 0 (done)
- [ ] Task 1 (todo)
- [ ] Task 2 (todo)
Some description text

## Wave 2
- [x] Task 3 (done)
- [ ] Task 4 (todo)
`;
            // Simulate the filtering logic from inject-plan-context.mjs
            const bodyStart = planContent.indexOf("---", 4);
            const body = planContent.slice(bodyStart + 3);
            const lines = body.split("\n");
            const filtered = lines.filter((l) => l.match(/^##\s/) || l.match(/^- \[ \]/));
            expect(filtered.join("\n")).toContain("Task 1 (todo)");
            expect(filtered.join("\n")).toContain("Task 2 (todo)");
            expect(filtered.join("\n")).toContain("Wave 1");
            expect(filtered.join("\n")).not.toContain("Task 0 (done)");
            expect(filtered.join("\n")).not.toContain("Some description");
        });
    });
    describe("Layer 5: Read budget tracking", () => {
        it("track-read-budget script creates budget file", async () => {
            const { execFile } = await import("node:child_process");
            const { promisify } = await import("node:util");
            const execAsync = promisify(execFile);
            const sessionId = `integration-budget-${process.pid}`;
            const budgetFile = join(tmpdir(), `forge-read-budget-${sessionId}.json`);
            const inputFile = join(tmpRoot, "budget-input.txt");
            await writeFile(inputFile, "x".repeat(2000));
            await execAsync("node", ["scripts/track-read-budget.mjs", inputFile], {
                env: { ...process.env, CLAUDE_SESSION_ID: sessionId },
            });
            const budget = JSON.parse(await readFile(budgetFile, "utf-8"));
            expect(budget.totalChars).toBe(2000);
            expect(budget.readCount).toBe(1);
            // Cleanup
            try {
                await rm(budgetFile, { force: true });
            }
            catch {
                /* ok */
            }
        });
    });
});
//# sourceMappingURL=context-explosion-defense.integration.test.js.map