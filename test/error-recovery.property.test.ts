/**
 * Property-based tests for Error Recovery Strategy.
 *
 * Covers Properties 1-9: Git_State_Scanner, Uncommitted_Change_Detector,
 * Progress_Reconciler, and Phase_Reconciler.
 *
 * Feature: error-recovery-strategy
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  buildReconciliationPatch,
  type CommitTaskMatch,
  extractCommitPatterns,
  type FileChange,
  findDependencyGaps,
  findPhaseInconsistencies,
  findProgressInconsistencies,
  type GitCommitEntry,
  getNextPhase,
  getPhaseSequence,
  matchChangesToTask,
  matchCommitsToTasks,
  PHASE_SEQUENCES,
  type ProgressInconsistency,
  type ProgressTaskEntry,
  parseGitStatus,
  type TaskCommitPattern,
} from "../src/error-recovery.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const gitHash = () =>
  fc
    .array(fc.constantFrom(..."0123456789abcdef".split("")), { minLength: 7, maxLength: 40 })
    .map((chars) => chars.join(""));

const gitCommitEntry = () =>
  fc.record({
    hash: gitHash(),
    message: fc.string({ minLength: 1, maxLength: 100 }),
    timestamp: fc.string({ minLength: 1, maxLength: 30 }),
  });

const _taskCommitPattern = () =>
  fc.record({
    taskId: fc.string({ minLength: 1, maxLength: 5 }).map((s) => s.replace(/\s/g, "")),
    taskTitle: fc.string({ minLength: 1, maxLength: 50 }),
    prefix: fc.option(fc.string({ minLength: 1, maxLength: 20 }), { freq: 80 }).map((p) => p ?? ""),
    keywords: fc.array(fc.string({ minLength: 3, maxLength: 15 }), { minLength: 1, maxLength: 5 }),
  });

const fileChange = () =>
  fc.record({
    filePath: fc
      .string({ minLength: 1, maxLength: 50 })
      .map((s) => `src/${s.replace(/\s/g, "_")}.ts`),
    status: fc.constantFrom("modified", "added", "deleted", "untracked") as fc.Arbitrary<
      FileChange["status"]
    >,
  });

const _progressTaskEntry = () =>
  fc
    .record({
      taskId: fc.string({ minLength: 1, maxLength: 5 }).map((s) => s.replace(/\s/g, "")),
      taskTitle: fc.string({ minLength: 1, maxLength: 30 }),
      completed: fc.boolean(),
      completionTime: fc.option(fc.string({ minLength: 1, maxLength: 30 })),
    })
    .map((e) => ({ ...e, completionTime: e.completionTime ?? null }));

const forgeTier = () =>
  fc.constantFrom("light", "standard", "full") as fc.Arbitrary<"light" | "standard" | "full">;
const forgePhase = () =>
  fc.constantFrom(
    "decide",
    "spec",
    "plan",
    "build",
    "review",
    "test",
    "ship",
    "learn",
  ) as fc.Arbitrary<"decide" | "spec" | "plan" | "build" | "review" | "test" | "ship" | "learn">;

// ---------------------------------------------------------------------------
// Property 1: Commit pattern extraction completeness
// ---------------------------------------------------------------------------

describe("Feature: error-recovery-strategy, Property 1: commit pattern extraction", () => {
  it("extracts patterns for every task with a commit message prefix", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            id: fc.integer({ min: 1, max: 20 }),
            title: fc.string({ minLength: 5, maxLength: 40 }),
            prefix: fc.string({ minLength: 5, maxLength: 20 }),
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (tasks) => {
          const planContent = tasks
            .map((t) => `## Task ${t.id}: ${t.title}\ncommit: ${t.prefix}`)
            .join("\n\n");

          const patterns = extractCommitPatterns(planContent);
          expect(patterns.length).toBe(tasks.length);
          for (const t of tasks) {
            const p = patterns.find((pat) => pat.taskId === String(t.id));
            expect(p).toBeDefined();
          }
        },
      ),
      { numRuns: 40 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 2: Commit-to-task matching with fuzzy tolerance
// ---------------------------------------------------------------------------

describe("Feature: error-recovery-strategy, Property 2: commit-to-task matching", () => {
  it("matches when prefix is present, does not match when absent", () => {
    fc.assert(
      fc.property(
        fc
          .record({
            prefix: fc.string({ minLength: 3, maxLength: 15 }),
            keyword: fc.string({ minLength: 3, maxLength: 10 }),
          })
          .filter(({ prefix, keyword }) => {
            const noPrefixMsg = `other ${keyword}`.toLowerCase();
            return !noPrefixMsg.includes(prefix.toLowerCase());
          }),
        gitCommitEntry(),
        ({ prefix, keyword }, commit) => {
          const pattern: TaskCommitPattern = {
            taskId: "1",
            taskTitle: keyword,
            prefix,
            keywords: [keyword.toLowerCase()],
          };

          // Prefix present → should match
          const commitWithPrefix: GitCommitEntry = {
            ...commit,
            message: `${prefix} ${keyword}`,
          };
          const matches = matchCommitsToTasks([commitWithPrefix], [pattern]);
          expect(matches.length).toBe(1);

          // Prefix absent → should not match
          const commitNoPrefix: GitCommitEntry = {
            ...commit,
            message: `other ${keyword}`,
          };
          const noMatches = matchCommitsToTasks([commitNoPrefix], [pattern]);
          expect(noMatches.length).toBe(0);
        },
      ),
      { numRuns: 40 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 3: Git status parsing correctness
// ---------------------------------------------------------------------------

describe("Feature: error-recovery-strategy, Property 3: git status parsing", () => {
  it("returns correct file paths and statuses with matching count", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            status: fc.constantFrom("M ", "A ", "D ", "??") as fc.Arbitrary<string>,
            file: fc
              .string({ minLength: 1, maxLength: 30 })
              .map((s) => `src/${s.replace(/\s/g, "_")}.ts`),
          }),
          { minLength: 0, maxLength: 20 },
        ),
        (entries) => {
          const porcelain = entries.map((e) => `${e.status} ${e.file}`).join("\n");
          const result = parseGitStatus(porcelain);

          expect(result).toHaveLength(entries.length);
          for (let i = 0; i < entries.length; i++) {
            expect(result[i].filePath).toBe(entries[i].file);
          }
        },
      ),
      { numRuns: 40 },
    );
  });

  it("returns empty array for empty input", () => {
    expect(parseGitStatus("")).toHaveLength(0);
    expect(parseGitStatus("   ")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Property 4: File change to task relevance matching
// ---------------------------------------------------------------------------

describe("Feature: error-recovery-strategy, Property 4: file change relevance", () => {
  it("returns exactly overlapping changes", () => {
    fc.assert(
      fc.property(
        fc.array(fileChange(), { minLength: 0, maxLength: 15 }),
        fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 10 }),
        (changes, taskPaths) => {
          const relevant = matchChangesToTask(changes, taskPaths);

          // All relevant changes must overlap with task paths
          for (const c of relevant) {
            const overlaps = taskPaths.some(
              (tp) =>
                tp === c.filePath ||
                c.filePath.startsWith(`${tp}/`) ||
                tp.startsWith(`${c.filePath}/`),
            );
            expect(overlaps).toBe(true);
          }
        },
      ),
      { numRuns: 40 },
    );
  });

  it("returns empty array when no overlap", () => {
    const changes: FileChange[] = [{ filePath: "src/a.ts", status: "modified" }];
    expect(matchChangesToTask(changes, ["src/other.ts"])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Property 5: Progress inconsistency detection
// ---------------------------------------------------------------------------

describe("Feature: error-recovery-strategy, Property 5: progress inconsistency detection", () => {
  it("flags exactly committed-but-not-marked tasks with full commit details", () => {
    fc.assert(
      fc.property(
        fc.array(gitCommitEntry(), { minLength: 1, maxLength: 10 }),
        fc.boolean(),
        fc.integer({ min: 1, max: 5 }),
        (commits, markCompleted, taskIdNum) => {
          const taskId = String(taskIdNum);
          const matches: CommitTaskMatch[] = commits.map((c) => ({
            commit: c,
            taskId,
            taskTitle: "Test Task",
            confidence: "exact" as const,
          }));

          const progress: ProgressTaskEntry[] = [
            {
              taskId,
              taskTitle: "Test Task",
              completed: markCompleted,
              completionTime: markCompleted ? "2026-01-01" : null,
            },
          ];

          const result = findProgressInconsistencies(matches, progress);

          if (markCompleted) {
            expect(result).toHaveLength(0);
          } else {
            // One inconsistency per commit match
            expect(result).toHaveLength(commits.length);
            expect(result[0].type).toBe("committed-but-not-marked");
            expect(result[0].commitHash).toBe(commits[0].hash);
            for (const inc of result) {
              expect(inc.commitHash).toBeDefined();
              expect(inc.commitMessage).toBeDefined();
              expect(inc.commitTimestamp).toBeDefined();
            }
          }
        },
      ),
      { numRuns: 40 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 6: Reconciliation patch ordering preserves Plan order
// ---------------------------------------------------------------------------

describe("Feature: error-recovery-strategy, Property 6: reconciliation patch ordering", () => {
  it("produces patches ordered by task order", () => {
    fc.assert(
      fc.property(
        fc
          .array(fc.string({ minLength: 1, maxLength: 5 }), { minLength: 2, maxLength: 8 })
          .map((ids) => [...new Set(ids)]),
        (taskOrder) => {
          // Create shuffled inconsistencies for a subset
          const inconsistencies: ProgressInconsistency[] = taskOrder.map((id, i) => ({
            taskId: id,
            taskTitle: `Task ${id}`,
            commitHash: `abc${i}`,
            commitMessage: `commit ${id}`,
            commitTimestamp: `2026-01-${String(i + 1).padStart(2, "0")}`,
            type: "committed-but-not-marked" as const,
          }));

          // Shuffle
          const shuffled = [...inconsistencies].sort(() => Math.random() - 0.5);

          const patches = buildReconciliationPatch(shuffled, taskOrder);

          // Patches should be in taskOrder
          expect(patches.map((p) => p.taskId)).toEqual(taskOrder);
          for (const patch of patches) {
            expect(patch.markCompleted).toBe(true);
          }
        },
      ),
      { numRuns: 40 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7: Dependency gap detection
// ---------------------------------------------------------------------------

describe("Feature: error-recovery-strategy, Property 7: dependency gap detection", () => {
  it("identifies missing dependencies in task chains", () => {
    fc.assert(
      fc.property(
        fc
          .record({
            id1: fc.string({ minLength: 1, maxLength: 5 }),
            id2: fc.string({ minLength: 1, maxLength: 5 }),
          })
          .filter(({ id1, id2 }) => id1 !== id2),
        ({ id1, id2 }) => {
          const taskOrder = [id1, id2];
          const inconsistencies: ProgressInconsistency[] = [
            {
              taskId: id2,
              taskTitle: "Task 2",
              commitHash: "abc123",
              commitMessage: "done",
              commitTimestamp: "2026-01-01",
              type: "committed-but-not-marked",
            },
          ];

          // id1 is not completed and has no commit → gap
          const progress: ProgressTaskEntry[] = [
            { taskId: id1, taskTitle: "Task 1", completed: false, completionTime: null },
            { taskId: id2, taskTitle: "Task 2", completed: false, completionTime: null },
          ];

          const gaps = findDependencyGaps(inconsistencies, progress, taskOrder);
          expect(gaps).toHaveLength(1);
          expect(gaps[0].missingDependencyTaskId).toBe(id1);
        },
      ),
      { numRuns: 40 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 8: Phase inconsistency detection (both directions)
// ---------------------------------------------------------------------------

describe("audit P2-3: phase-ahead must not fire mid-build (the common interrupt case)", () => {
  it("incomplete tasks at the build phase is consistent, not 'ahead'", () => {
    // The canonical resume scenario: standard tier, interrupted mid-build,
    // tasks half-done. Before the fix this reported "ahead" and the engine
    // defaulted to reverting build→plan, corrupting a normal in-progress run.
    for (const tier of ["light", "standard", "full"] as const) {
      const result = findPhaseInconsistencies(false, "build", tier);
      expect(result).toBeNull();
    }
  });

  it("incomplete tasks at a pre-build phase (plan/spec/decide) is consistent", () => {
    // Planning phases legitimately have incomplete tasks (needs still being
    // refined). Must not be flagged as ahead.
    expect(findPhaseInconsistencies(false, "plan", "standard")).toBeNull();
    expect(findPhaseInconsistencies(false, "spec", "full")).toBeNull();
    expect(findPhaseInconsistencies(false, "decide", "full")).toBeNull();
  });

  it("incomplete tasks at a POST-build phase (review/test/ship) IS ahead", () => {
    // Genuinely suspicious: we reached review/test/ship with tasks still
    // incomplete — something skipped build completion. This should still fire.
    expect(findPhaseInconsistencies(false, "review", "standard")?.direction).toBe("ahead");
    expect(findPhaseInconsistencies(false, "test", "standard")?.direction).toBe("ahead");
    expect(findPhaseInconsistencies(false, "ship", "standard")?.direction).toBe("ahead");
    // light tier: review comes right after build → still ahead when incomplete
    expect(findPhaseInconsistencies(false, "review", "light")?.direction).toBe("ahead");
  });
});

describe("Feature: error-recovery-strategy, Property 8: phase inconsistency detection", () => {
  it("detects behind, ahead, or consistent state", () => {
    fc.assert(
      fc.property(fc.boolean(), forgeTier(), forgePhase(), (allCompleted, tier, phase) => {
        const result = findPhaseInconsistencies(allCompleted, phase, tier);

        // Phase must be in the tier's sequence for any result
        const seq = PHASE_SEQUENCES[tier];
        const buildIdx = seq.indexOf("build");

        if (allCompleted) {
          const idx = seq.indexOf(phase);
          if (idx >= 0 && idx < seq.length - 1) {
            expect(result).not.toBeNull();
            expect(result?.direction).toBe("behind");
          }
        } else {
          // Audit P2-3: "ahead" only when past the build (execution) phase.
          const idx = seq.indexOf(phase);
          if (idx > buildIdx) {
            expect(result).not.toBeNull();
            expect(result?.direction).toBe("ahead");
          }
        }
      }),
      { numRuns: 40 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 9: Next phase computation correctness
// ---------------------------------------------------------------------------

describe("Feature: error-recovery-strategy, Property 9: next phase computation", () => {
  it("returns correct next phase or null", () => {
    const tiers: Array<"light" | "standard" | "full"> = ["light", "standard", "full"];

    for (const tier of tiers) {
      const seq = PHASE_SEQUENCES[tier];
      for (let i = 0; i < seq.length; i++) {
        const next = getNextPhase(seq[i], tier);
        if (i < seq.length - 1) {
          expect(next).toBe(seq[i + 1]);
        } else {
          expect(next).toBeNull();
        }
      }
    }

    // Non-existent phase returns null
    expect(getNextPhase("learn", "light")).toBeNull();
  });

  it("getPhaseSequence returns correct sequences for all tiers", () => {
    expect(getPhaseSequence("light")).toEqual(["build", "review"]);
    expect(getPhaseSequence("standard")).toEqual(["plan", "build", "review", "test", "ship"]);
    expect(getPhaseSequence("full")).toEqual([
      "decide",
      "spec",
      "plan",
      "build",
      "review",
      "test",
      "ship",
      "learn",
    ]);
  });
});
