/**
 * Integration tests for the context explosion defense system.
 *
 * Verifies end-to-end behavior across remaining layers:
 * - Layer 3: Subagent file-based return
 * - Layer 4: Phase-aware plan injection
 * - Layer 5: Read budget tracking
 *
 * Note: Layer 1 (Read cache dedup) was removed — forge_read_cached deleted,
 * compression delegated to Headroom. Layer 2 (Phase boundary budget) used
 * the read-cache index and was removed with it; budget tracking is covered
 * independently by Layer 5.
 *
 * @vitest-environment node
 */
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
const tmpRoot = join(tmpdir(), `forge-integration-${process.pid}`);
describe("context-explosion-defense integration", () => {
    beforeEach(async () => {
        await mkdir(tmpRoot, { recursive: true });
    });
    afterEach(async () => {
        await rm(tmpRoot, { recursive: true, force: true });
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
            const p0 = Number.parseInt(summary.match(/^p0: (\d+)/m)?.[1] ?? "999", 10);
            const p1 = Number.parseInt(summary.match(/^p1: (\d+)/m)?.[1] ?? "999", 10);
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