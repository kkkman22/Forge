import { describe, it, expect } from "vitest";
import type { CheckAttempt } from "../src/conflict-resolver.js";

describe("buildFrozenRefusalPrompt", () => {
  it("generates 3-option prompt for frozen paths", async () => {
    const { buildFrozenRefusalPrompt } = await import("../src/conflict-resolver.js");
    const prompt = buildFrozenRefusalPrompt([".forge/specs/auth/spec.md"]);
    expect(prompt).toContain("手动解决");
    expect(prompt).toContain("解锁后合并");
    expect(prompt).toContain("中止合并");
    expect(prompt).toContain(".forge/specs/auth/spec.md");
  });

  it("handles multiple frozen paths", async () => {
    const { buildFrozenRefusalPrompt } = await import("../src/conflict-resolver.js");
    const prompt = buildFrozenRefusalPrompt([
      ".forge/specs/auth/spec.md",
      ".forge/config.md",
    ]);
    expect(prompt).toContain(".forge/specs/auth/spec.md");
    expect(prompt).toContain(".forge/config.md");
  });
});

describe("validateConflictResolution", () => {
  it("returns passed when no failures", async () => {
    const { validateConflictResolution } = await import("../src/conflict-resolver.js");
    const gate = validateConflictResolution([]);
    expect(gate.passed).toBe(true);
    expect(gate.attemptCount).toBe(0);
    expect(gate.escalateToDebug).toBe(false);
  });

  it("returns passed when last attempt succeeded", async () => {
    const { validateConflictResolution } = await import("../src/conflict-resolver.js");
    const attempts: CheckAttempt[] = [
      { timestamp: 1, filesSinceLastAttempt: new Set(["a.ts"]), exitCode: 1 },
      { timestamp: 2, filesSinceLastAttempt: new Set(["a.ts"]), exitCode: 0 },
    ];
    const gate = validateConflictResolution(attempts);
    expect(gate.passed).toBe(true);
    expect(gate.escalateToDebug).toBe(false);
  });

  it("escalates after 3 consecutive failures with file changes", async () => {
    const { validateConflictResolution } = await import("../src/conflict-resolver.js");
    const attempts: CheckAttempt[] = [
      { timestamp: 1, filesSinceLastAttempt: new Set(["a.ts"]), exitCode: 1 },
      { timestamp: 2, filesSinceLastAttempt: new Set(["b.ts"]), exitCode: 1 },
      { timestamp: 3, filesSinceLastAttempt: new Set(["c.ts"]), exitCode: 1 },
    ];
    const gate = validateConflictResolution(attempts);
    expect(gate.passed).toBe(false);
    expect(gate.escalateToDebug).toBe(true);
    expect(gate.attemptCount).toBe(3);
  });

  it("does not escalate on re-runs without file changes", async () => {
    const { validateConflictResolution } = await import("../src/conflict-resolver.js");
    const attempts: CheckAttempt[] = [
      { timestamp: 1, filesSinceLastAttempt: new Set(["a.ts"]), exitCode: 1 },
      { timestamp: 2, filesSinceLastAttempt: new Set(), exitCode: 1 },
      { timestamp: 3, filesSinceLastAttempt: new Set(), exitCode: 1 },
    ];
    const gate = validateConflictResolution(attempts);
    expect(gate.passed).toBe(false);
    expect(gate.escalateToDebug).toBe(false);
    expect(gate.attemptCount).toBe(1);
  });
});

describe("classifyConflictZone", () => {
  it("classifies frozen paths", async () => {
    const { classifyConflictZone } = await import("../src/conflict-resolver.js");
    expect(classifyConflictZone(".forge/specs/auth/spec.md", "")).toBe("frozen");
    expect(classifyConflictZone(".forge/config.md", "")).toBe("frozen");
    expect(classifyConflictZone(".forge/plans/auth.md", "")).toBe("frozen");
  });

  it("classifies guarded paths", async () => {
    const { classifyConflictZone } = await import("../src/conflict-resolver.js");
    expect(classifyConflictZone(".forge/progress/auth.md", "")).toBe("guarded");
    expect(classifyConflictZone(".forge/reviews/auth.md", "")).toBe("guarded");
    expect(classifyConflictZone(".forge/knowledge/instincts.md", "")).toBe("guarded");
    expect(classifyConflictZone(".forge/decisions/ADR-001.md", "")).toBe("guarded");
    expect(classifyConflictZone(".forge/knowledge/known-failures.md", "")).toBe("guarded");
    expect(classifyConflictZone(".forge/knowledge/solutions/x.md", "")).toBe("guarded");
  });

  it("classifies open paths", async () => {
    const { classifyConflictZone } = await import("../src/conflict-resolver.js");
    expect(classifyConflictZone(".forge/findings/x.md", "")).toBe("open");
    expect(classifyConflictZone(".forge/debug/y.md", "")).toBe("open");
  });

  it("classifies source paths", async () => {
    const { classifyConflictZone } = await import("../src/conflict-resolver.js");
    expect(classifyConflictZone("src/index.ts", "")).toBe("source");
    expect(classifyConflictZone("test/a.test.ts", "")).toBe("source");
  });

  it("delegates to conflict-classifier for all paths", async () => {
    const { classifyConflictZone } = await import("../src/conflict-resolver.js");
    expect(classifyConflictZone(".forge/plans/auth.md", "")).toBe("frozen");
    expect(classifyConflictZone(".forge/knowledge/solutions/x.md", "")).toBe("guarded");
  });
});

describe("applyGuardedMerge", () => {
  it("merges progress files by task_id", async () => {
    const { applyGuardedMerge } = await import("../src/conflict-resolver.js");
    const result = applyGuardedMerge("progress",
      "- [ ] task-a: Do A",
      "- [x] task-a: Done A",
    );
    expect(result.merged).toContain("[x] task-a");
    expect(result.conflicts).toBeInstanceOf(Array);
  });

  it("merges instincts by confidence=max, count=sum", async () => {
    const { applyGuardedMerge } = await import("../src/conflict-resolver.js");
    const result = applyGuardedMerge("known-failures",
      "p1: confidence=0.5 count=3 | Text",
      "p1: confidence=0.8 count=2 | Text",
    );
    expect(result.merged).toContain("confidence=0.8");
    expect(result.merged).toContain("count=5");
    expect(result.conflicts).toBeInstanceOf(Array);
  });

  it("merges reviews by append + sort", async () => {
    const { applyGuardedMerge } = await import("../src/conflict-resolver.js");
    const result = applyGuardedMerge("reviews",
      "[quality][P2] src/a.ts: Issue",
      "[security][P0] src/b.ts: Issue",
    );
    expect(result.merged).toContain("quality");
    expect(result.merged).toContain("security");
    expect(result.conflicts).toEqual([]);
  });

  it("merges ADR with ID reassignment", async () => {
    const { applyGuardedMerge } = await import("../src/conflict-resolver.js");
    const result = applyGuardedMerge("adr",
      "ADR-001: Keep",
      "ADR-001: New\nADR-002: Also New",
    );
    expect(result.merged).toContain("ADR-001");
    expect(result.conflicts).toEqual([]);
  });
});

describe("parseConflictedPaths", () => {
  it("extracts conflicted file paths from git stderr", async () => {
    const { parseConflictedPaths } = await import("../src/conflict-resolver.js");
    const gitOutput = `Auto-merging .forge/progress/auth.md
CONFLICT (content): Merge conflict in .forge/progress/auth.md
Auto-merging .forge/reviews/auth.md
CONFLICT (content): Merge conflict in .forge/reviews/auth.md
Auto-merging src/index.ts
CONFLICT (content): Merge conflict in src/index.ts`;
    const paths = parseConflictedPaths(gitOutput);
    expect(paths).toEqual([
      ".forge/progress/auth.md",
      ".forge/reviews/auth.md",
      "src/index.ts",
    ]);
  });

  it("returns empty array when no conflicts", async () => {
    const { parseConflictedPaths } = await import("../src/conflict-resolver.js");
    expect(parseConflictedPaths("Already up to date.")).toEqual([]);
  });

  it("deduplicates paths", async () => {
    const { parseConflictedPaths } = await import("../src/conflict-resolver.js");
    const output = `CONFLICT: Merge conflict in .forge/progress/a.md\nCONFLICT: Merge conflict in .forge/progress/a.md`;
    const paths = parseConflictedPaths(output);
    expect(paths).toEqual([".forge/progress/a.md"]);
  });
});
