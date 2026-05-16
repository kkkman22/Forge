import { describe, expect, it, vi } from "vitest";
import { resolveProjectRoot, logResolvedRoot } from "../../src/mcp/project-root.js";

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
});

describe("logResolvedRoot", () => {
  it("logs env source to stderr", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logResolvedRoot({ path: "/abs/project", source: "env" });
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("[forge-context] resolved project root: /abs/project (env)"),
    );
    spy.mockRestore();
  });

  it("logs cwd fallback to stderr", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logResolvedRoot({ path: "/some/cwd", source: "cwd" });
    expect(spy).toHaveBeenCalledWith(
      expect.stringContaining("[forge-context] resolved project root: /some/cwd (cwd fallback)"),
    );
    spy.mockRestore();
  });
});
