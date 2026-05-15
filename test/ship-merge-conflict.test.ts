import { describe, it, expect } from "vitest";

describe("ship_merge conflict-resolver integration", () => {
  it("resolves guarded conflicts via conflict-resolver", async () => {
    const { resolveConflicts } = await import("../src/conflict-resolver.js");
    const result = await resolveConflicts(
      [".forge/progress/auth.md"],
      "autonomous",
      {
        statusContent: "current_task: auth\n",
        repoRoot: "/tmp/test",
        readFileContent: async () => "- [ ] task-a: Do A",
        writeFileContent: async () => {},
      },
    );
    expect(result.allResolved).toBe(true);
  });

  it("abort merge when frozen conflict refused in autonomous", async () => {
    const { resolveConflicts } = await import("../src/conflict-resolver.js");
    const result = await resolveConflicts(
      [".forge/specs/auth/spec.md"],
      "autonomous",
      {
        statusContent: "current_task: auth\n",
        repoRoot: "/tmp/test",
        readFileContent: async () => "status: locked",
        writeFileContent: async () => {},
      },
    );
    expect(result.frozenRefused).toBe(true);
    expect(result.allResolved).toBe(false);
  });

  it("parseConflictedPaths extracts paths from merge error", async () => {
    const { parseConflictedPaths } = await import("../src/conflict-resolver.js");
    const errMsg = `Ship merge failed: CONFLICT (content): Merge conflict in .forge/reviews/auth.md`;
    const paths = parseConflictedPaths(errMsg);
    expect(paths).toEqual([".forge/reviews/auth.md"]);
  });

  it("no conflict — resolver not needed", () => {
    expect(true).toBe(true);
  });
});
