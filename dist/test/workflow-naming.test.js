import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
describe("Forge saved workflow naming", () => {
    it("uses forge-review.js instead of generic multi-agent-review.js", () => {
        expect(existsSync(join(process.cwd(), ".claude", "workflows", "forge-review.js"))).toBe(true);
        expect(existsSync(join(process.cwd(), ".claude", "workflows", "multi-agent-review.js"))).toBe(false);
    });
    it("forge-review workflow passes JavaScript syntax check", () => {
        expect(() => execFileSync("node", [
            "--check",
            join(process.cwd(), ".claude", "workflows", "forge-review.js"),
        ])).not.toThrow();
    });
});
//# sourceMappingURL=workflow-naming.test.js.map