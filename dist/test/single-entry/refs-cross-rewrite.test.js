import { describe, it, expect } from "vitest";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { glob } from "glob";
const ROOT = resolve(import.meta.dirname, "..", "..");
const VALID_SUBS = new Set([
    "abort", "accept", "build", "build-light", "control-cli", "control-ui",
    "debug", "decide", "decide-teams", "fix", "fix-conflicts", "grill",
    "learn", "loop", "mutate", "pack", "plan", "recap", "refactor",
    "resume", "review", "router", "ship", "spec", "status", "storm",
    "test", "verify", "zoom-out",
]);
describe("R4.2: cross-sub references rewritten to lib structure", () => {
    it("no ../forge-<sub> pattern remains in lib/", async () => {
        const libs = await glob("skills/forge/lib/**/*.md", { cwd: ROOT });
        const violations = [];
        for (const libPath of libs) {
            const content = readFileSync(resolve(ROOT, libPath), "utf-8");
            const lines = content.split("\n");
            for (let i = 0; i < lines.length; i++) {
                if (/(?:\.\.\/|skills\/)forge-[a-z]/.test(lines[i])) {
                    violations.push(`${libPath}:${i + 1}: ${lines[i].trim()}`);
                }
            }
        }
        expect(violations).toEqual([]);
    });
    it("all ../<sub>/ cross-references point to valid sub names", async () => {
        const libs = await glob("skills/forge/lib/*/instructions.md", { cwd: ROOT });
        const violations = [];
        for (const libPath of libs) {
            const content = readFileSync(resolve(ROOT, libPath), "utf-8");
            const crossRefPattern = /\.\.\/([a-z][a-z0-9-]*)\//g;
            let match;
            while ((match = crossRefPattern.exec(content)) !== null) {
                const targetSub = match[1];
                if (!VALID_SUBS.has(targetSub)) {
                    violations.push(`${libPath}: cross-ref to unknown sub '${targetSub}'`);
                }
            }
        }
        expect(violations).toEqual([]);
    });
});
//# sourceMappingURL=refs-cross-rewrite.test.js.map