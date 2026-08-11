/**
 * Unit tests for the forge-root-resolver module.
 *
 * Tests the resolveForgeRoot function with specific scenarios.
 */
import { describe, expect, it } from "vitest";
import type { FsProbe, ResolveInput } from "../src/forge-root-resolver.js";
import { resolveForgeRoot } from "../src/forge-root-resolver.js";

describe("resolveForgeRoot - unit tests", () => {
  const _mockFs = {
    isDir: (_path: string) => {
      // Will be overridden in individual tests
      return false;
    },
  };

  it("Case 1: pluginRoot exists with agents dir returns plugin", () => {
    const input: ResolveInput = {
      pluginRoot: "/plg",
      scriptDir: "/some/path/scripts",
      homeDir: "/home/user",
    };

    const fs: FsProbe = {
      isDir: (path: string) => path === "/plg/agents",
    };

    const result = resolveForgeRoot(input, fs);
    expect(result.kind).toBe("plugin");
    expect(result).toHaveProperty("root", "/plg");
  });

  it("Case 2: pluginRoot missing agents, scriptDir parent has agents returns script-relative", () => {
    const input: ResolveInput = {
      pluginRoot: "/plg",
      scriptDir: "/x/scripts",
      homeDir: "/home/user",
    };

    const fs: FsProbe = {
      isDir: (path: string) => path === "/x/agents",
    };

    const result = resolveForgeRoot(input, fs);
    expect(result.kind).toBe("script-relative");
    expect(result).toHaveProperty("root", "/x");
  });

  it("Case 3: pluginRoot empty, scriptDir no agents, homeDir has global agents returns global", () => {
    const input: ResolveInput = {
      pluginRoot: null,
      scriptDir: "/some/path/scripts",
      homeDir: "/h",
    };

    const fs: FsProbe = {
      isDir: (path: string) => path === "/h/.claude/skills/tinkerman/agents",
    };

    const result = resolveForgeRoot(input, fs);
    expect(result.kind).toBe("global");
    expect(result).toHaveProperty("root", "/h/.claude/skills/tinkerman");
  });

  it("Case 4: all three missing returns not-found with checked count 3", () => {
    const input: ResolveInput = {
      pluginRoot: "/plg",
      scriptDir: "/x/scripts",
      homeDir: "/h",
    };

    const fs: FsProbe = {
      isDir: () => false,
    };

    const result = resolveForgeRoot(input, fs);
    expect(result.kind).toBe("not-found");
    expect("checked" in result && result.checked).toHaveLength(3);
  });

  it("Case 5: empty string pluginRoot treated as null", () => {
    const input: ResolveInput = {
      pluginRoot: "",
      scriptDir: "/some/path/scripts",
      homeDir: "/home/user",
    };

    const fs: FsProbe = {
      isDir: (path: string) => path === "/some/path/agents",
    };

    const result = resolveForgeRoot(input, fs);
    expect(result.kind).toBe("script-relative");
    expect(result).toHaveProperty("root", "/some/path");
  });
});
