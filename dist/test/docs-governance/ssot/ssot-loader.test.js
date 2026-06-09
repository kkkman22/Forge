import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadSsotData } from "../../../src/docs-governance/ssot/ssot-loader.js";
const tempRoots = [];
function tempRoot() {
    const root = mkdtempSync(join(tmpdir(), "forge-ssot-loader-test-"));
    tempRoots.push(root);
    return root;
}
afterEach(() => {
    for (const root of tempRoots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
    }
});
describe("loadSsotData", () => {
    it("derives routing SSOT from the workflow graph instead of stale routing JSON", () => {
        const root = tempRoot();
        mkdirSync(join(root, ".forge"), { recursive: true });
        mkdirSync(join(root, "docs", "_ssot"), { recursive: true });
        writeFileSync(join(root, ".forge", "config.md"), [
            "---",
            "docs:",
            "  ssot_sources:",
            "    - topic: routing",
            '      source: "docs/_ssot/routing.json"',
            '      renderer: "routing-table"',
            "---",
        ].join("\n"), "utf-8");
        writeFileSync(join(root, "docs", "_ssot", "routing.json"), JSON.stringify([{ tier: "Standard", condition: "stale", sequence: ["ship"] }]), "utf-8");
        const routing = loadSsotData(root).get("routing");
        expect(routing).toEqual(expect.arrayContaining([
            expect.objectContaining({
                key: "standard",
                sequence: ["plan", "build", "review", "test", "ship"],
            }),
        ]));
        expect(JSON.stringify(routing)).not.toContain('"stale"');
    });
});
//# sourceMappingURL=ssot-loader.test.js.map