import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
const FORGE_ROOT = join(import.meta.dirname, "../..");
const PLUGIN_DIST = join(FORGE_ROOT, "dist-plugin");
describe("plugin dist contract", () => {
    it("contains hooks/hooks.json", () => {
        expect(existsSync(join(PLUGIN_DIST, "hooks/hooks.json"))).toBe(true);
    });
    it("contains .mcp.json or MCP manifest in plugin config", () => {
        // Either .mcp.json in root or MCP config in .claude-plugin/plugin.json
        const hasMcpJson = existsSync(join(PLUGIN_DIST, ".mcp.json"));
        const hasPluginJson = existsSync(join(PLUGIN_DIST, ".claude-plugin/plugin.json"));
        expect(hasMcpJson || hasPluginJson).toBe(true);
    });
    it("hooks.json contains at least one hook", async () => {
        const fs = await import("node:fs/promises");
        const content = await fs.readFile(join(PLUGIN_DIST, "hooks/hooks.json"), "utf-8");
        const parsed = JSON.parse(content);
        const hooksSection = parsed.hooks;
        expect(hooksSection).toBeDefined();
        const hookCount = Object.values(hooksSection)
            .flat()
            .reduce((sum, group) => sum + (Array.isArray(group.hooks) ? group.hooks.length : 0), 0);
        expect(hookCount).toBeGreaterThan(0);
    });
});
//# sourceMappingURL=plugin-dist-contract.test.js.map