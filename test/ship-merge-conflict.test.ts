import { describe, expect, it } from "vitest";

describe("ship_merge conflict-resolver integration", () => {
  it("resolves guarded conflicts via handleMergeConflict", async () => {
    const { handleMergeConflict } = await import("../src/conflict-resolver.js");
    const result = await handleMergeConflict(
      "Ship merge failed: CONFLICT (content): Merge conflict in .tinkerman/progress/auth.md",
      "autonomous",
      {
        statusContent: "current_task: auth\n",
        repoRoot: "/tmp/test",
        readFileContent: async () => "- [ ] task-a: Do A",
        writeFileContent: async () => {},
      },
    );
    expect(result.handled).toBe(true);
    expect(result.resolvedPaths).toContain(".tinkerman/progress/auth.md");
    expect(result.shouldAbort).toBe(false);
  });

  it("aborts on frozen conflict in autonomous via handleMergeConflict", async () => {
    const { handleMergeConflict } = await import("../src/conflict-resolver.js");
    const result = await handleMergeConflict(
      "CONFLICT (content): Merge conflict in .tinkerman/specs/auth/spec.md",
      "autonomous",
      {
        statusContent: "current_task: auth\n",
        repoRoot: "/tmp/test",
        readFileContent: async () => "status: locked",
        writeFileContent: async () => {},
      },
    );
    expect(result.handled).toBe(true);
    expect(result.shouldAbort).toBe(true);
    expect(result.refusedPaths).toContain(".tinkerman/specs/auth/spec.md");
  });

  it("returns not handled when no conflict paths found", async () => {
    const { handleMergeConflict } = await import("../src/conflict-resolver.js");
    const result = await handleMergeConflict("Some other error message", "autonomous", {
      statusContent: "",
      repoRoot: "/tmp/test",
      readFileContent: async () => "",
      writeFileContent: async () => {},
    });
    expect(result.handled).toBe(false);
    expect(result.shouldAbort).toBe(true);
  });

  it("resolves reviews conflict and proceeds with merge", async () => {
    const { handleMergeConflict } = await import("../src/conflict-resolver.js");
    const result = await handleMergeConflict(
      "CONFLICT (content): Merge conflict in .tinkerman/reviews/auth.md",
      "autonomous",
      {
        statusContent: "current_task: auth\n",
        repoRoot: "/tmp/test",
        readFileContent: async () => "[quality][P2] src/a.ts: Issue",
        writeFileContent: async () => {},
      },
    );
    expect(result.handled).toBe(true);
    expect(result.resolvedPaths).toContain(".tinkerman/reviews/auth.md");
    expect(result.shouldAbort).toBe(false);
  });
});
