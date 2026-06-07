import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
const ROOT = resolve(import.meta.dirname, "../..");
const MODULES = ["grill", "error-recovery", "review", "decide"];
describe("long-term evolution: domain kernel / adapter boundaries", () => {
    it("legacy top-level modules stay thin compatibility adapters", () => {
        for (const mod of MODULES) {
            const file = resolve(ROOT, "src", `${mod}.ts`);
            const content = readFileSync(file, "utf-8");
            const codeLines = content
                .split("\n")
                .map((line) => line.trim())
                .filter((line) => line.length > 0 && !line.startsWith("*") && !line.startsWith("/*"));
            expect(codeLines.length, `${mod}.ts should remain thin`).toBeLessThanOrEqual(90);
            expect(content, `${mod}.ts should re-export from submodule index`).toContain(`./${mod}/index.js`);
            expect(content, `${mod}.ts should not declare local business functions`).not.toMatch(/export\s+function\s+(?!.*from)/);
        }
    });
    it("each extracted module has explicit kernel files and an index adapter", () => {
        for (const mod of MODULES) {
            const dir = resolve(ROOT, "src", mod);
            expect(statSync(dir).isDirectory()).toBe(true);
            const files = readdirSync(dir)
                .filter((f) => f.endsWith(".ts"))
                .sort();
            expect(files).toContain("index.ts");
            expect(files.filter((f) => f !== "index.ts").length, `${mod} needs kernel modules`).toBeGreaterThanOrEqual(3);
            const index = readFileSync(join(dir, "index.ts"), "utf-8");
            expect(index).toMatch(/export \*/);
        }
    });
});
//# sourceMappingURL=domain-kernel-adapter-boundary.test.js.map