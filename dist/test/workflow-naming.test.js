import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
describe("Forge saved workflow naming", () => {
    it("uses forge-review.js as the production dispatch target", () => {
        expect(existsSync(join(process.cwd(), ".claude", "workflows", "forge-review.js"))).toBe(true);
    });
    it("allows multi-agent-review.js as experimental-only workflow", () => {
        // Per workflow-fallback-ladder.md: generic names are experimental only,
        // MUST NOT be production dispatch targets — but may exist on disk.
        expect(existsSync(join(process.cwd(), ".claude", "workflows", "multi-agent-review.js"))).toBe(true);
    });
    it("forge-review workflow passes JavaScript syntax check", () => {
        expect(() => execFileSync("node", [
            "--check",
            join(process.cwd(), ".claude", "workflows", "forge-review.js"),
        ])).not.toThrow();
    });
});
//# sourceMappingURL=workflow-naming.test.js.map