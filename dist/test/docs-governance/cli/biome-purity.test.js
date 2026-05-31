import { execFileSync } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
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
        const tmpFile = resolve(ROOT, "src/docs-governance/ssot/renderers/_test_impure.ts");
        writeFileSync(tmpFile, `import { execSync } from "child_process";\nconsole.log("impure");\n`);
        try {
            execFileSync("npx", ["biome", "lint", tmpFile], {
                cwd: ROOT,
                encoding: "utf-8",
                timeout: 30_000,
            });
            // If lint passes somehow, fail the test
            expect.unreachable("Expected biome lint to fail on restricted import");
        }
        catch (err) {
            const stderr = err.stderr ?? "";
            expect(stderr).toContain("noRestrictedImports");
        }
        finally {
            try {
                unlinkSync(tmpFile);
            }
            catch {
                /* already cleaned up */
            }
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