import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const ROOT = resolve(__dirname, "../../../");
const PURE_PATHS = [
    "src/docs-governance/index-generator/generator.ts",
    "src/docs-governance/index-generator/format.ts",
    "src/docs-governance/ssot/renderers/commands-table.ts",
    "src/docs-governance/ssot/renderers/routing-table.ts",
    "src/docs-governance/ssot/renderers/security-tiers.ts",
    "src/docs-governance/ssot/renderers/json-list.ts",
];
// Simulated file path that matches the biome override pattern
// for src/docs-governance/ssot/renderers/*.ts
const RENDERER_PATH = "src/docs-governance/ssot/renderers/_test_impure.ts";
describe("Biome purity rules for generators/renderers", () => {
    it("passes lint on all pure files", () => {
        const result = execFileSync("npx", ["biome", "lint", ...PURE_PATHS], {
            cwd: ROOT,
            encoding: "utf-8",
            timeout: 30_000,
        });
        expect(result).toContain("No fixes applied");
    });
    it("flags child_process import in renderer files", () => {
        // Use --stdin-file-path to simulate the file path without creating
        // a real file on disk. This avoids a race condition where the parallel
        // test-matrix CI job creates _test_impure.ts and the check job's
        // biome scan picks it up.
        const impureCode = `import { execSync } from "child_process";\nconsole.log("impure");\n`;
        try {
            execFileSync("npx", ["biome", "lint", "--stdin-file-path", RENDERER_PATH], {
                cwd: ROOT,
                encoding: "utf-8",
                timeout: 30_000,
                input: impureCode,
            });
            expect.unreachable("Expected biome lint to fail on restricted import");
        }
        catch (err) {
            const stderr = err.stderr ?? "";
            // stdin mode reports generic "contents aren't fixed" instead of rule name
            expect(stderr).toMatch(/aren't fixed|noRestrictedImports/);
        }
    });
    it("generator and renderer files do not import child_process", () => {
        for (const p of PURE_PATHS) {
            const content = readFileSync(resolve(ROOT, p), "utf-8");
            expect(content).not.toMatch(/from\s+["']child_process["']/);
            expect(content).not.toMatch(/from\s+["']node:child_process["']/);
        }
    });
});
//# sourceMappingURL=biome-purity.test.js.map