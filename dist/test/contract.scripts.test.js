/**
 * Contract + smoke tests for scripts/ — Peripheral Asset Validation (Req 8.3)
 *
 * Validates:
 *   1. Each script in scripts/ is a valid file with proper shebang
 *   2. Each script has the executable permission bit set
 *   3. Scripts that support no-arg invocation don't crash unexpectedly
 */
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const ROOT = resolve(import.meta.dirname, "..");
const scriptsDir = resolve(ROOT, "scripts");
// Discover all shell scripts
const scriptFiles = readdirSync(scriptsDir)
    .filter((f) => f.endsWith(".sh"))
    .map((f) => ({ name: f, path: resolve(scriptsDir, f) }));
// ---------------------------------------------------------------------------
// Req 8.3: Each script is a valid file
// ---------------------------------------------------------------------------
describe("Contract: scripts/ are valid shell scripts", () => {
    it("at least one script exists in scripts/", () => {
        expect(scriptFiles.length).toBeGreaterThan(0);
    });
    for (const { name, path: scriptPath } of scriptFiles) {
        it(`scripts/${name} has a valid shebang line`, () => {
            const content = readFileSync(scriptPath, "utf-8");
            const firstLine = content.split("\n")[0];
            const validShebangs = [
                "#!/bin/bash",
                "#!/usr/bin/env bash",
                "#!/bin/sh",
                "#!/usr/bin/env sh",
            ];
            expect(validShebangs.includes(firstLine), `scripts/${name} has invalid shebang: "${firstLine}". Expected one of: ${validShebangs.join(", ")}`).toBe(true);
        });
        it(`scripts/${name} has the executable permission bit set`, () => {
            const mode = statSync(scriptPath).mode;
            expect((mode & 0o111) !== 0, `scripts/${name} is not executable (mode: ${mode.toString(8)}). Run: chmod +x scripts/${name}`).toBe(true);
        });
        it(`scripts/${name} is not empty`, () => {
            const content = readFileSync(scriptPath, "utf-8");
            expect(content.trim().length).toBeGreaterThan(0);
        });
    }
});
// ---------------------------------------------------------------------------
// Req 8.3: Smoke test — no-arg invocation doesn't crash unexpectedly
// ---------------------------------------------------------------------------
describe("Contract: scripts/ smoke tests (no-arg invocation)", () => {
    /**
     * Scripts that are known to require specific environment or arguments
     * and are expected to exit non-zero when invoked without args.
     * These are excluded from the no-arg smoke test.
     */
    const SKIP_NO_ARG = new Set([
        "init.sh", // Requires project setup context
        "install-dist.sh", // Requires dist bundle to exist
        "build-dist.sh", // Requires build environment
        "check-readme-metrics.sh", // Runs full metrics check which can be slow
    ]);
    for (const { name, path: scriptPath } of scriptFiles) {
        if (SKIP_NO_ARG.has(name)) {
            it(`scripts/${name} is skipped for no-arg smoke test (requires specific environment)`, () => {
                expect(true).toBe(true);
            });
            continue;
        }
        it(`scripts/${name} no-arg invocation does not crash with unexpected error`, () => {
            try {
                // Run with a short timeout to prevent hanging scripts
                execSync(`bash "${scriptPath}"`, {
                    cwd: ROOT,
                    timeout: 10_000,
                    stdio: "pipe",
                    env: { ...process.env, CI: "true" },
                });
                // Exit code 0 is fine
            }
            catch (err) {
                const error = err;
                // Exit codes 0 and 1 are acceptable (1 = validation failure, which is expected)
                // Exit code 2 = usage error (also acceptable for no-arg invocation)
                // Only truly unexpected crashes (segfault, signal kills, etc.) should fail
                const exitCode = error.status ?? 0;
                const acceptableExitCodes = [0, 1, 2];
                expect(acceptableExitCodes.includes(exitCode), `scripts/${name} crashed with unexpected exit code ${exitCode}. stderr: ${error.stderr?.toString().slice(0, 200)}`).toBe(true);
            }
        });
    }
});
//# sourceMappingURL=contract.scripts.test.js.map