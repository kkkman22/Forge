import { describe, expect, it } from "vitest";

const io = {
  readFileContent: async () => "- [ ] task-a: Do A",
  writeFileContent: async () => {},
};

describe("buildGitHook", () => {
  it("returns success when no conflicts", async () => {
    const { buildGitHook } = await import("../src/build-git-hook.js");
    const result = await buildGitHook.runWithConflictHandling("pull", {
      cwd: "/tmp/test",
      simulateOutput: "Already up to date.",
      ...io,
    });
    expect(result.status).toBe("success");
    expect(result.conflictResult).toBeUndefined();
  });

  it("triggers resolver on guarded conflict", async () => {
    const { buildGitHook } = await import("../src/build-git-hook.js");
    const result = await buildGitHook.runWithConflictHandling("rebase", {
      cwd: "/tmp/test",
      simulateOutput: "CONFLICT (content): Merge conflict in .tinkerman/progress/auth.md",
      ...io,
    });
    expect(result.status).toBe("conflict");
    expect(result.conflictResult).toBeDefined();
  });

  it("aborts on frozen conflict in autonomous", async () => {
    const { buildGitHook } = await import("../src/build-git-hook.js");
    const result = await buildGitHook.runWithConflictHandling("merge", {
      cwd: "/tmp/test",
      simulateOutput: "CONFLICT (content): Merge conflict in .tinkerman/specs/auth/spec.md",
      mode: "autonomous",
      statusContent: "current_task: auth\n",
      ...io,
    });
    expect(result.status).toBe("frozen-refused");
  });
});
