/**
 * track-read-budget.mjs — unit tests.
 *
 * @vitest-environment node
 */
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
const execAsync = promisify(execFile);
const scriptPath = join(process.cwd(), "scripts/track-read-budget.mjs");
const testSessionId = `test-budget-${process.pid}`;
const budgetFile = join(tmpdir(), `forge-read-budget-${testSessionId}.json`);
const tmpRoot = join(tmpdir(), `forge-test-budget-${process.pid}`);
describe("track-read-budget", () => {
    beforeEach(async () => {
        await mkdir(tmpRoot, { recursive: true });
    });
    afterEach(async () => {
        await rm(tmpRoot, { recursive: true, force: true });
        try {
            await rm(budgetFile, { force: true });
        }
        catch {
            /* ok */
        }
    });
    it("creates budget file on first read", async () => {
        const inputFile = join(tmpRoot, "tool-result.txt");
        await writeFile(inputFile, "x".repeat(1000));
        await execAsync("node", [scriptPath, inputFile], {
            env: { ...process.env, CLAUDE_SESSION_ID: testSessionId },
        });
        const budget = JSON.parse(await readFile(budgetFile, "utf-8"));
        expect(budget.totalChars).toBe(1000);
        expect(budget.readCount).toBe(1);
    });
    it("accumulates across multiple reads", async () => {
        const file1 = join(tmpRoot, "r1.txt");
        const file2 = join(tmpRoot, "r2.txt");
        await writeFile(file1, "a".repeat(500));
        await writeFile(file2, "b".repeat(300));
        const env = { ...process.env, CLAUDE_SESSION_ID: testSessionId };
        await execAsync("node", [scriptPath, file1], { env });
        await execAsync("node", [scriptPath, file2], { env });
        const budget = JSON.parse(await readFile(budgetFile, "utf-8"));
        expect(budget.totalChars).toBe(800);
        expect(budget.readCount).toBe(2);
    });
    it("warns when exceeding 100KB threshold", async () => {
        const inputFile = join(tmpRoot, "big.txt");
        // 101 KB
        await writeFile(inputFile, "x".repeat(101 * 1024));
        const env = { ...process.env, CLAUDE_SESSION_ID: testSessionId };
        const { stderr } = await execAsync("node", [scriptPath, inputFile], { env });
        expect(stderr).toContain("⚠️");
        expect(stderr).toContain("101KB");
    });
    it("force-warns when exceeding 150KB threshold", async () => {
        // Write budget file with existing 100KB, then add 51KB
        await writeFile(budgetFile, JSON.stringify({ totalChars: 100 * 1024, readCount: 5 }));
        const inputFile = join(tmpRoot, "overflow.txt");
        await writeFile(inputFile, "y".repeat(51 * 1024));
        const env = { ...process.env, CLAUDE_SESSION_ID: testSessionId };
        const { stderr } = await execAsync("node", [scriptPath, inputFile], { env });
        expect(stderr).toContain("⛔");
    });
    it("exits 0 even on errors (fail-open)", async () => {
        // Pass non-existent file — should not throw
        const { stdout, stderr } = await execAsync("node", [scriptPath, "/nonexistent/path"], {
            env: { ...process.env, CLAUDE_SESSION_ID: testSessionId },
        });
        // No error thrown = exit 0
        expect(stdout).toBeDefined();
    });
    it("handles missing input file argument gracefully", async () => {
        const { stdout } = await execAsync("node", [scriptPath], {
            env: { ...process.env, CLAUDE_SESSION_ID: testSessionId },
        });
        expect(stdout).toBeDefined();
    });
});
//# sourceMappingURL=track-read-budget.test.js.map