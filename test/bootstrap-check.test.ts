import { describe, expect, it } from "vitest";

// Dynamic import of ESM .mjs
const { shouldShowBootstrap } = await import("../scripts/bootstrap-check.mjs");

describe("shouldShowBootstrap", () => {
  it("Case 1: returns skip:already_initialized when .tinkerman/config.md exists", () => {
    const env = { pluginRoot: "/some/path", cwd: "/test" };
    const fsExists = (path: string) => path === "/test/.tinkerman/config.md";

    const result = shouldShowBootstrap(env, fsExists);

    expect(result).toEqual({ kind: "skip", reason: "already_initialized" });
  });

  it("Case 2: returns skip:user_dismissed when only .bootstrap-dismissed exists", () => {
    const env = { pluginRoot: "/some/path", cwd: "/test" };
    const fsExists = (path: string) => path === "/test/.tinkerman/.bootstrap-dismissed";

    const result = shouldShowBootstrap(env, fsExists);

    expect(result).toEqual({ kind: "skip", reason: "user_dismissed" });
  });

  it("Case 3: returns skip:no_plugin_context when pluginRoot is empty and both files missing", () => {
    const env = { pluginRoot: "", cwd: "/test" };
    const fsExists = () => false;

    const result = shouldShowBootstrap(env, fsExists);

    expect(result).toEqual({ kind: "skip", reason: "no_plugin_context" });
  });

  it("Case 4: returns show when pluginRoot is non-empty and both files missing", () => {
    const env = { pluginRoot: "/x", cwd: "/test" };
    const fsExists = () => false;

    const result = shouldShowBootstrap(env, fsExists);

    expect(result).toEqual({ kind: "show" });
  });

  it("Case 5: returns skip:already_initialized (highest priority) when both .tinkerman/config.md and .bootstrap-dismissed exist", () => {
    const env = { pluginRoot: "/some/path", cwd: "/test" };
    const fsExists = () => true;

    const result = shouldShowBootstrap(env, fsExists);

    expect(result).toEqual({ kind: "skip", reason: "already_initialized" });
  });
});
