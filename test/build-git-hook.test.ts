import { describe, it, expect } from "vitest";

describe("buildGitHook", () => {
  it("returns success when no conflicts", async () => {
    const { buildGitHook } = await import("../src/build-git-hook.js");
    const result = await buildGitHook.runWithConflictHandling("pull", {
      cwd: "/tmp/test",
      simulateOutput: "Already up to date.",
    });
    expect(result.status).toBe("success");
    expect(result.conflictResult).toBeUndefined();
  });

  it("triggers resolver on guarded conflict", async () => {
    const { buildGitHook } = await import("../src/build-git-hook.js");
    const result = await buildGitHook.runWithConflictHandling("rebase", {
      cwd: "/tmp/test",
      simulateOutput: "CONFLICT (content): Merge conflict in .forge/progress/auth.md",
    });
    expect(result.status).toBe("conflict");
    expect(result.conflictResult).toBeDefined();
  });

  it("aborts on frozen conflict in autonomous", async () => {
    const { buildGitHook } = await import("../src/build-git-hook.js");
    const result = await buildGitHook.runWithConflictHandling("merge", {
      cwd: "/tmp/test",
      simulateOutput: "CONFLICT (content): Merge conflict in .forge/specs/auth/spec.md",
      mode: "autonomous",
      statusContent: "current_task: auth\n",
    });
    expect(result.status).toBe("frozen-refused");
  });
});
