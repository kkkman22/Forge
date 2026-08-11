import { describe, expect, it } from "vitest";
import { resolveLibPath } from "../../src/forge-dispatcher/path-resolve.js";

const CWD = process.cwd();

describe("R2.2: path safety — dual mode, no traversal/absolute/symlink", () => {
  describe("dev mode (CLAUDE_PLUGIN_ROOT unset)", () => {
    it("resolves valid sub to cwd-relative lib path", () => {
      const result = resolveLibPath("build", { pluginRoot: undefined, cwd: CWD });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.path).toContain("skills/tinkerman/lib/build/instructions.md");
        expect(result.path).toMatch(new RegExp(`^${CWD}`));
      }
    });

    it("rejects traversal sub", () => {
      const result = resolveLibPath("../../../etc/passwd" as never, {
        pluginRoot: undefined,
        cwd: CWD,
      });
      expect(result.ok).toBe(false);
    });

    it("rejects absolute path sub", () => {
      const result = resolveLibPath("/etc/passwd" as never, {
        pluginRoot: undefined,
        cwd: CWD,
      });
      expect(result.ok).toBe(false);
    });
  });

  describe("plugin mode (CLAUDE_PLUGIN_ROOT set)", () => {
    const MOCK_PLUGIN_ROOT = "/mock/plugin/root";

    it("resolves valid sub to plugin-relative lib path", () => {
      const result = resolveLibPath("review", {
        pluginRoot: MOCK_PLUGIN_ROOT,
        cwd: CWD,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.path).toContain("skills/tinkerman/lib/review/instructions.md");
        expect(result.path).toMatch(new RegExp(`^${MOCK_PLUGIN_ROOT}`));
      }
    });

    it("rejects traversal in plugin mode", () => {
      const result = resolveLibPath("../../../etc/shadow" as never, {
        pluginRoot: MOCK_PLUGIN_ROOT,
        cwd: CWD,
      });
      expect(result.ok).toBe(false);
    });

    it("rejects absolute path in plugin mode", () => {
      const result = resolveLibPath("/etc/shadow" as never, {
        pluginRoot: MOCK_PLUGIN_ROOT,
        cwd: CWD,
      });
      expect(result.ok).toBe(false);
    });
  });
});
