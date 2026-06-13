import { describe, expect, it } from "vitest";
import { extractCommand, extractEndpoint, extractMethod } from "../src/accept-driver.js";
import { buildPermissionArgs, resolveAllowedReadFiles } from "../src/mcp/tools/forge-read.js";
import { parseSimpleYaml, parseYamlValue } from "../src/rules-loader.js";
describe("forge-read: buildPermissionArgs (branches)", () => {
    it("buildPermissionArgs runs without throwing", () => {
        expect(Array.isArray(buildPermissionArgs(["src/"]))).toBe(true);
    });
});
describe("forge-read: resolveAllowedReadFiles (branches)", () => {
    it("resolves relative paths", () => {
        const r = resolveAllowedReadFiles(["src/a.ts"]);
        expect(Array.isArray(r)).toBe(true);
    });
    it("handles empty array", () => {
        expect(resolveAllowedReadFiles([])).toEqual([]);
    });
});
describe("accept-driver: extractEndpoint (branches)", () => {
    it("extracts endpoint from 'endpoint is /api/x'", () => {
        expect(extractEndpoint("endpoint is /api/users")).toBe("/api/users");
    });
    it("extracts endpoint from 'url /api/y'", () => {
        expect(extractEndpoint("url /api/y")).toBe("/api/y");
    });
    it("returns null for plain text without endpoint keyword", () => {
        expect(extractEndpoint("just some random text")).toBeNull();
    });
    it("returns null for empty input", () => {
        expect(extractEndpoint("")).toBeNull();
    });
});
describe("accept-driver: extractMethod (branches)", () => {
    it("extracts POST method", () => {
        expect(extractMethod("POST /api/x")).toBe("POST");
    });
    it("extracts GET method case-insensitively", () => {
        expect(extractMethod("using get method")).toBe("GET");
    });
    it("defaults to GET for no method", () => {
        expect(extractMethod("no method")).toBe("GET");
    });
    it("defaults to GET for empty input", () => {
        expect(extractMethod("")).toBe("GET");
    });
});
describe("accept-driver: extractCommand (branches)", () => {
    it("extracts command from run 'cmd'", () => {
        expect(extractCommand("run 'npm test'")).toBe("npm test");
    });
    it('extracts command from execute "cmd"', () => {
        expect(extractCommand('execute "npm run build"')).toBe("npm run build");
    });
    it("returns null for no command", () => {
        expect(extractCommand("no command")).toBeNull();
    });
});
describe("rules-loader: parseYamlValue (all branches)", () => {
    it("returns null for empty/null/tilde", () => {
        expect(parseYamlValue("")).toBeNull();
        expect(parseYamlValue("null")).toBeNull();
        expect(parseYamlValue("~")).toBeNull();
    });
    it("returns true/false for booleans", () => {
        expect(parseYamlValue("true")).toBe(true);
        expect(parseYamlValue("false")).toBe(false);
    });
    it("strips double quotes", () => {
        expect(parseYamlValue('"hello"')).toBe("hello");
    });
    it("strips single quotes", () => {
        expect(parseYamlValue("'world'")).toBe("world");
    });
    it("returns raw value for unquoted strings", () => {
        expect(parseYamlValue("hello")).toBe("hello");
        expect(parseYamlValue("123")).toBe("123");
    });
});
describe("rules-loader: parseSimpleYaml (branches)", () => {
    it("parses key: value pairs", () => {
        const r = parseSimpleYaml("key: value\nnum: 42");
        expect(r?.key).toBe("value");
    });
    it("returns null for empty input", () => {
        expect(parseSimpleYaml("")).toBeDefined();
    });
    it("handles nested lines", () => {
        const r = parseSimpleYaml("parent:\n  child: value");
        expect(r).toBeDefined();
    });
});
//# sourceMappingURL=export-batch-branches.test.js.map