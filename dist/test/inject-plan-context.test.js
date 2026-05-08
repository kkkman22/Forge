/**
 * Unit tests for inject-plan-context.mjs — plan context injection script.
 *
 * Tests the script by executing it as a subprocess with a temp plans directory,
 * verifying active plan detection, token budget truncation, and fail-open behavior.
 *
 * **Validates: Requirement 8 (Plan injection)**
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, afterEach, it, expect } from "vitest";
const SCRIPT_PATH = join(process.cwd(), "scripts", "inject-plan-context.mjs");
function createTempPlansDir() {
    const dir = mkdtempSync(join(tmpdir(), "forge-plan-test-"));
    mkdirSync(join(dir, ".forge", "plans"), { recursive: true });
    return dir;
}
function writePlan(plansDir, name, frontmatter, body) {
    writeFileSync(join(plansDir, ".forge", "plans", name), `---\n${frontmatter}\n---\n\n${body}`);
}
function runScript(cwd) {
    try {
        return execFileSync("node", [SCRIPT_PATH], { cwd, encoding: "utf-8", timeout: 5000 });
    }
    catch {
        return "";
    }
}
describe("inject-plan-context.mjs", () => {
    let tempDir;
    afterEach(() => {
        if (tempDir) {
            try {
                rmSync(tempDir, { recursive: true, force: true });
            }
            catch {
                // Best effort
            }
        }
    });
    it("outputs nothing when plans directory is empty", () => {
        tempDir = createTempPlansDir();
        const output = runScript(tempDir);
        expect(output).toBe("");
    });
    it("outputs active plans", () => {
        tempDir = createTempPlansDir();
        writePlan(tempDir, "feature-x.md", 'status: "approved"\ntopic: feature-x', "## Objective\nBuild feature X");
        const output = runScript(tempDir);
        expect(output).toContain("=== Forge Context ===");
        expect(output).toContain("feature-x.md");
        expect(output).toContain("Build feature X");
    });
    it("outputs at most 3 active plans (sorted by mtime)", () => {
        tempDir = createTempPlansDir();
        // Create 5 plans with different content
        for (let i = 1; i <= 5; i++) {
            writePlan(tempDir, `plan-${i}.md`, "status: approved", `Plan ${i} content`);
        }
        const output = runScript(tempDir);
        // Should contain at most 3 plan headers
        const planHeaders = output.match(/--- .+plan-\d+\.md ---/g);
        expect(planHeaders).not.toBeNull();
        expect(planHeaders.length).toBeLessThanOrEqual(3);
    });
    it("skips plans without active/approved status", () => {
        tempDir = createTempPlansDir();
        writePlan(tempDir, "completed.md", "status: completed", "This plan is done");
        writePlan(tempDir, "no-frontmatter.md", "", "No status field");
        const output = runScript(tempDir);
        expect(output).toBe("");
    });
    it("truncates long plans", () => {
        tempDir = createTempPlansDir();
        const longBody = "x".repeat(3000);
        writePlan(tempDir, "long-plan.md", "status: approved", longBody);
        const output = runScript(tempDir);
        expect(output).toContain("[... truncated]");
    });
    it("truncates when total exceeds budget", () => {
        tempDir = createTempPlansDir();
        // Create 3 plans with very large bodies
        for (let i = 1; i <= 3; i++) {
            writePlan(tempDir, `big-${i}.md`, "status: approved", "y".repeat(4000));
        }
        const output = runScript(tempDir);
        // Should contain truncation notice
        expect(output.length).toBeLessThanOrEqual(9000); // budget + header overhead
    });
    it("fails open when plans directory does not exist", () => {
        tempDir = mkdtempSync(join(tmpdir(), "forge-plan-test-"));
        // No .forge/plans directory
        const output = runScript(tempDir);
        expect(output).toBe("");
    });
    it("correctly formats output with plan paths and content", () => {
        tempDir = createTempPlansDir();
        writePlan(tempDir, "test-plan.md", "status: approved\ntopic: test", "## Tasks\n- [ ] Task 1\n- [x] Task 2");
        const output = runScript(tempDir);
        expect(output).toContain(".forge/plans/test-plan.md");
        expect(output).toContain("Task 1");
        expect(output).toContain("Task 2");
    });
});
//# sourceMappingURL=inject-plan-context.test.js.map