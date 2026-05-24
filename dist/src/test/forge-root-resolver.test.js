/**
 * Unit tests for the forge-root-resolver module.
 *
 * Tests the resolveForgeRoot function with specific scenarios.
 */
import { describe, expect, it } from "vitest";
import { resolveForgeRoot } from "../src/forge-root-resolver.js";
describe("resolveForgeRoot - unit tests", () => {
    const _mockFs = {
        isDir: (_path) => {
            // Will be overridden in individual tests
            return false;
        },
    };
    it("Case 1: pluginRoot exists with agents dir returns plugin", () => {
        const input = {
            pluginRoot: "/plg",
            scriptDir: "/some/path/scripts",
            homeDir: "/home/user",
        };
        const fs = {
            isDir: (path) => path === "/plg/agents",
        };
        const result = resolveForgeRoot(input, fs);
        expect(result.kind).toBe("plugin");
        expect(result).toHaveProperty("root", "/plg");
    });
    it("Case 2: pluginRoot missing agents, scriptDir parent has agents returns script-relative", () => {
        const input = {
            pluginRoot: "/plg",
            scriptDir: "/x/scripts",
            homeDir: "/home/user",
        };
        const fs = {
            isDir: (path) => path === "/x/agents",
        };
        const result = resolveForgeRoot(input, fs);
        expect(result.kind).toBe("script-relative");
        expect(result).toHaveProperty("root", "/x");
    });
    it("Case 3: pluginRoot empty, scriptDir no agents, homeDir has global agents returns global", () => {
        const input = {
            pluginRoot: null,
            scriptDir: "/some/path/scripts",
            homeDir: "/h",
        };
        const fs = {
            isDir: (path) => path === "/h/.claude/skills/forge/agents",
        };
        const result = resolveForgeRoot(input, fs);
        expect(result.kind).toBe("global");
        expect(result).toHaveProperty("root", "/h/.claude/skills/forge");
    });
    it("Case 4: all three missing returns not-found with checked count 3", () => {
        const input = {
            pluginRoot: "/plg",
            scriptDir: "/x/scripts",
            homeDir: "/h",
        };
        const fs = {
            isDir: () => false,
        };
        const result = resolveForgeRoot(input, fs);
        expect(result.kind).toBe("not-found");
        expect("checked" in result && result.checked).toHaveLength(3);
    });
    it("Case 5: empty string pluginRoot treated as null", () => {
        const input = {
            pluginRoot: "",
            scriptDir: "/some/path/scripts",
            homeDir: "/home/user",
        };
        const fs = {
            isDir: (path) => path === "/some/path/agents",
        };
        const result = resolveForgeRoot(input, fs);
        expect(result.kind).toBe("script-relative");
        expect(result).toHaveProperty("root", "/some/path");
    });
});
//# sourceMappingURL=forge-root-resolver.test.js.map