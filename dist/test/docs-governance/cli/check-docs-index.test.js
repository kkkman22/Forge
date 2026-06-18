import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
const TMP_DIR = join(import.meta.dirname, "__tmp_check_index_test__");
const VALID_FM = `---
title: "Test Doc"
category: getting-started
audience:
  - new-user
updated: 2026-05-01
owner: test-team
---
Content here.
`;
const VALID_FM_REF = `---
title: "Ref Doc"
category: reference
audience:
  - maintainer
updated: 2026-05-01
owner: test-team
---
Reference content.
`;
function createFile(dir, relPath, content) {
    const fullPath = join(dir, relPath);
    const fileDir = join(fullPath, "..");
    mkdirSync(fileDir, { recursive: true });
    writeFileSync(fullPath, content, "utf-8");
}
function runCheckIndex(docsDir) {
    const scriptPath = join(import.meta.dirname, "..", "..", "..", "scripts", "check-docs-index.ts");
    try {
        const stdout = execSync(`npx tsx "${scriptPath}" "${docsDir}"`, {
            encoding: "utf-8",
            cwd: TMP_DIR,
            timeout: 15_000,
            stdio: "pipe",
        });
        return { stdout, stderr: "", exitCode: 0 };
    }
    catch (err) {
        const e = err;
        return {
            stdout: e.stdout ?? "",
            stderr: e.stderr ?? "",
            exitCode: e.status ?? 1,
        };
    }
}
function runBuildIndex(docsDir) {
    const scriptPath = join(import.meta.dirname, "..", "..", "..", "scripts", "build-docs-index.ts");
    execSync(`npx tsx "${scriptPath}" "${docsDir}"`, {
        encoding: "utf-8",
        cwd: TMP_DIR,
        timeout: 15_000,
        stdio: "pipe",
    });
}
// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────
// Each it spawns `npx tsx` (cold start ~2s) up to 3x via execSync, so the
// default 5s testTimeout is too tight under pre-push/CI load. 15s matches
// the per-test timeout already used in build-docs-index.test.ts.
describe("check-docs-index CLI", { timeout: 15_000 }, () => {
    beforeAll(() => {
        // Clean any leftover from a prior interrupted run before recreating.
        // Without this, a stale `new-file-test/` (with api.md + a matching INDEX)
        // from a crashed/killed run would make the "new file" drift test see
        // in-sync output (exit 0) instead of detecting the drift.
        rmSync(TMP_DIR, { recursive: true, force: true });
        mkdirSync(TMP_DIR, { recursive: true });
    });
    afterAll(() => {
        rmSync(TMP_DIR, { recursive: true, force: true });
    });
    it("exits 0 when index is in sync", () => {
        const docsDir = join(TMP_DIR, "sync-test");
        createFile(docsDir, "intro.md", VALID_FM);
        // Build index first
        runBuildIndex(docsDir);
        // Now check — should be in sync
        const result = runCheckIndex(docsDir);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("in sync");
    });
    it("exits 1 when INDEX.md is out of sync", () => {
        const docsDir = join(TMP_DIR, "stale-test");
        createFile(docsDir, "guide.md", VALID_FM);
        // Build index
        runBuildIndex(docsDir);
        // Now modify the index to make it stale
        const indexPath = join(docsDir, "INDEX.md");
        const original = readFileSync(indexPath, "utf-8");
        writeFileSync(indexPath, `${original}\n<!-- stale -->\n`, "utf-8");
        const result = runCheckIndex(docsDir);
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toContain("mismatch");
    });
    it("exits 1 when INDEX.en.md is out of sync", () => {
        const docsDir = join(TMP_DIR, "stale-en-test");
        createFile(docsDir, "guide.md", VALID_FM);
        // Build index
        runBuildIndex(docsDir);
        // Tamper with EN index
        const enIndexPath = join(docsDir, "INDEX.en.md");
        const original = readFileSync(enIndexPath, "utf-8");
        writeFileSync(enIndexPath, `${original}\n<!-- tampered -->\n`, "utf-8");
        const result = runCheckIndex(docsDir);
        expect(result.exitCode).toBe(1);
    });
    it("exits 1 when INDEX.md does not exist", () => {
        const docsDir = join(TMP_DIR, "no-index-test");
        createFile(docsDir, "guide.md", VALID_FM);
        // Do NOT build index
        const result = runCheckIndex(docsDir);
        expect(result.exitCode).toBe(1);
    });
    it("suggests regeneration command on mismatch", () => {
        const docsDir = join(TMP_DIR, "suggest-test");
        createFile(docsDir, "guide.md", VALID_FM);
        // Build then tamper
        runBuildIndex(docsDir);
        const indexPath = join(docsDir, "INDEX.md");
        writeFileSync(indexPath, "stale content\n", "utf-8");
        const result = runCheckIndex(docsDir);
        expect(result.exitCode).toBe(1);
        const combined = result.stdout + result.stderr;
        expect(combined).toContain("docs:index");
    });
    it("shows help with --help flag", () => {
        const scriptPath = join(import.meta.dirname, "..", "..", "..", "scripts", "check-docs-index.ts");
        const result = execSync(`npx tsx "${scriptPath}" --help`, {
            encoding: "utf-8",
            cwd: TMP_DIR,
            timeout: 15_000,
        });
        expect(result).toContain("check-docs-index");
        expect(result).toContain("--help");
    });
    it("detects new file added since last index build", () => {
        const docsDir = join(TMP_DIR, "new-file-test");
        createFile(docsDir, "guide.md", VALID_FM);
        // Build with 1 file
        runBuildIndex(docsDir);
        // Add a new file
        createFile(docsDir, "api.md", VALID_FM_REF);
        const result = runCheckIndex(docsDir);
        expect(result.exitCode).toBe(1);
    });
});
//# sourceMappingURL=check-docs-index.test.js.map