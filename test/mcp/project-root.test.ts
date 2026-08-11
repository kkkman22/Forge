import { describe, expect, it, vi } from "vitest";
import { logResolvedRoot, resolveProjectRoot } from "../../src/mcp/project-root.js";

describe("resolveProjectRoot", () => {
  it("uses CLAUDE_PROJECT_DIR when set and non-empty", () => {
    const result = resolveProjectRoot({ CLAUDE_PROJECT_DIR: "/abs/project" });
    expect(result.path).toBe("/abs/project");
    expect(result.source).toBe("env");
  });

  it("falls back to cwd when CLAUDE_PROJECT_DIR is unset", () => {
    const result = resolveProjectRoot({});
    expect(result.path).toBe(process.cwd());
    expect(result.source).toBe("cwd");
  });

  it("falls back to cwd when CLAUDE_PROJECT_DIR is empty string", () => {
    const result = resolveProjectRoot({ CLAUDE_PROJECT_DIR: "" });
    expect(result.path).toBe(process.cwd());
    expect(result.source).toBe("cwd");
  });

  it("resolves relative paths against cwd", () => {
    const result = resolveProjectRoot({ CLAUDE_PROJECT_DIR: "./project" });
    expect(result.path).toMatch(/\/project$/);
    expect(result.path).not.toBe("./project");
    expect(result.source).toBe("env");
  });

  it("trims whitespace from CLAUDE_PROJECT_DIR", () => {
    const result = resolveProjectRoot({ CLAUDE_PROJECT_DIR: "  /abs/project  " });
    expect(result.path).toBe("/abs/project");
    expect(result.source).toBe("env");
  });

  it("falls back when CLAUDE_PROJECT_DIR is whitespace-only", () => {
    const result = resolveProjectRoot({ CLAUDE_PROJECT_DIR: "   " });
    expect(result.path).toBe(process.cwd());
    expect(result.source).toBe("cwd");
  });

  it("rejects CLAUDE_PROJECT_DIR with '..' path traversal", () => {
    const result = resolveProjectRoot({ CLAUDE_PROJECT_DIR: "/abs/project/../../../etc" });
    expect(result.path).toBe(process.cwd());
    expect(result.source).toBe("cwd");
  });

  it("rejects CLAUDE_PROJECT_DIR with embedded '..' segment", () => {
    const result = resolveProjectRoot({ CLAUDE_PROJECT_DIR: "/home/user/../other" });
    expect(result.path).toBe(process.cwd());
    expect(result.source).toBe("cwd");
  });

  it("allows paths without '..' components", () => {
    const result = resolveProjectRoot({ CLAUDE_PROJECT_DIR: "/abs/project/deep/path" });
    expect(result.path).toBe("/abs/project/deep/path");
    expect(result.source).toBe("env");
  });

  it("rejects relative '..' only path", () => {
    const result = resolveProjectRoot({ CLAUDE_PROJECT_DIR: ".." });
    expect(result.path).toBe(process.cwd());
    expect(result.source).toBe("cwd");
  });

  it("allows path with dots in directory names (not '..')", () => {
    const result = resolveProjectRoot({ CLAUDE_PROJECT_DIR: "/abs/my.project/dir" });
    expect(result.path).toBe("/abs/my.project/dir");
    expect(result.source).toBe("env");
  });
});

describe("logResolvedRoot", () => {
  it("logs env source to stderr", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logResolvedRoot({ path: "/abs/project", source: "env" });
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("[tinkerman-context] resolved project root: /abs/project (env)"),
    );
    spy.mockRestore();
  });

  it("logs cwd fallback to stderr", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logResolvedRoot({ path: "/some/cwd", source: "cwd" });
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining(
        "[tinkerman-context] resolved project root: /some/cwd (cwd fallback)",
      ),
    );
    spy.mockRestore();
  });
});
