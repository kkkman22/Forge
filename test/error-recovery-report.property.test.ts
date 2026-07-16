/**
 * Property-based tests for Recovery_Engine report builder.
 *
 * Covers Properties 14-15: report completeness and task segmentation.
 *
 * Feature: error-recovery-strategy
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  buildRecoveryReport,
  type CommitTaskMatch,
  calculateSegmentation,
  type DependencyGap,
  type FileChange,
  type InterruptionCategory,
  type PhaseInconsistency,
} from "../src/error-recovery.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const _gitCommitEntry = () =>
  fc.record({
    hash: fc.string({ minLength: 7, maxLength: 7 }).map((s) => s.replace(/\s/g, "a")),
    message: fc.string({ minLength: 1, maxLength: 50 }),
    timestamp: fc.string({ minLength: 1, maxLength: 30 }),
  });

const progressInconsistency = () =>
  fc.record({
    taskId: fc.string({ minLength: 1, maxLength: 5 }).map((s) => s.replace(/\s/g, "")),
    taskTitle: fc.string({ minLength: 1, maxLength: 20 }),
    commitHash: fc.string({ minLength: 7, maxLength: 7 }).map((s) => s.replace(/\s/g, "a")),
    commitMessage: fc.string({ minLength: 1, maxLength: 20 }),
    commitTimestamp: fc.string({ minLength: 1, maxLength: 20 }),
    type: fc.constant("committed-but-not-marked" as const),
  });

const phaseInconsistency = () =>
  fc.record({
    currentPhase: fc.constantFrom("build", "review", "test", "ship") as fc.Arbitrary<
      PhaseInconsistency["currentPhase"]
    >,
    expectedPhase: fc.constantFrom("build", "review", "test", "ship") as fc.Arbitrary<
      PhaseInconsistency["expectedPhase"]
    >,
    direction: fc.constantFrom("behind", "ahead") as fc.Arbitrary<PhaseInconsistency["direction"]>,
    evidence: fc.string({ minLength: 1, maxLength: 50 }),
  });

const header = () =>
  fc.record({
    taskName: fc.string({ minLength: 1, maxLength: 30 }),
    tier: fc.constantFrom("light", "standard", "full"),
    phase: fc.constantFrom("decide", "spec", "plan", "build", "review", "test", "ship", "learn"),
    lastUpdate: fc.string({ minLength: 1, maxLength: 30 }),
    interruptionCategory: fc.constantFrom(
      "task-completed-not-committed",
      "committed-not-progress-updated",
      "progress-updated-not-phase-advanced",
      "subagent-mid-execution",
      "clean-state",
    ) as fc.Arbitrary<InterruptionCategory>,
  });

// ---------------------------------------------------------------------------
// Property 14: Report completeness
// ---------------------------------------------------------------------------

describe("Feature: error-recovery-strategy, Property 14: report completeness", () => {
  it("includes all inconsistencies with required fields, action options, and correct summary", () => {
    fc.assert(
      fc.property(
        header(),
        fc.array(progressInconsistency(), { minLength: 0, maxLength: 5 }),
        fc.oneof(fc.constant(null), phaseInconsistency()),
        fc.record({
          category: fc.constantFrom(
            "task-completed-not-committed",
            "committed-not-progress-updated",
            "clean-state",
          ) as fc.Arbitrary<InterruptionCategory>,
          evidence: fc.string({ minLength: 1, maxLength: 50 }),
          tddPhase: fc.constant(null),
        }),
        fc.record({
          changes: fc.constant<FileChange[]>([]),
          relevantChanges: fc.constant<FileChange[]>([]),
          isClean: fc.boolean(),
        }),
        fc.constant<DependencyGap[]>([]),
        (hdr, progInc, phaseInc, classification, uncommitted, depGaps) => {
          const report = buildRecoveryReport(
            hdr,
            progInc,
            phaseInc,
            classification,
            uncommitted,
            depGaps,
          );

          // Header preserved
          expect(report.header).toEqual(hdr);

          // Each inconsistency has non-empty fields
          for (const inc of report.inconsistencies) {
            expect(inc.category.length).toBeGreaterThan(0);
            expect(inc.evidence.length).toBeGreaterThan(0);
            expect(inc.recommendedAction.length).toBeGreaterThan(0);
          }

          // Each inconsistency has at least one action option with exactly one default
          for (const opts of report.actions) {
            expect(opts.length).toBeGreaterThanOrEqual(0);
            const defaults = opts.filter((o) => o.isDefault);
            if (opts.length > 0) {
              expect(defaults.length).toBe(1);
            }
          }

          // Summary counts are consistent
          expect(report.summary.totalInconsistencies).toBe(report.inconsistencies.length);
          expect(report.summary.autoFixable + report.summary.requiresUserDecision).toBe(
            report.summary.totalInconsistencies,
          );
        },
      ),
      { numRuns: 40 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 15: Task segmentation correctness
// ---------------------------------------------------------------------------

describe("Feature: error-recovery-strategy, Property 15: task segmentation", () => {
  it("partitions tasks with no duplicates and consistent lastCompletedIndex", () => {
    fc.assert(
      fc.property(
        fc
          .array(fc.string({ minLength: 1, maxLength: 5 }), { minLength: 2, maxLength: 10 })
          .map((ids) => [...new Set(ids)]),
        fc.array(fc.string({ minLength: 1, maxLength: 5 }), { minLength: 0, maxLength: 5 }),
        (planTaskIds, completedIds) => {
          // Ensure completed IDs are a subset of plan IDs
          const planSet = new Set(planTaskIds);
          const completed = [...new Set(completedIds.filter((id) => planSet.has(id)))];

          const commitMatches: CommitTaskMatch[] = completed.map((id) => ({
            commit: {
              hash: `hash${id}`,
              message: `commit ${id}`,
              timestamp: "2026-01-01",
            },
            taskId: id,
            taskTitle: `Task ${id}`,
            confidence: "exact" as const,
          }));

          const result = calculateSegmentation(planTaskIds, completed, commitMatches, null);

          // All plan tasks accounted for
          const allIds = [
            ...result.completedTasks.map((t) => t.taskId),
            ...(result.currentTask ? [result.currentTask.taskId] : []),
            ...result.remainingTasks,
          ];
          expect(allIds.sort()).toEqual([...planTaskIds].sort());

          // No duplicates
          expect(new Set(allIds).size).toBe(allIds.length);

          // Completed tasks match input
          expect(result.completedTasks.map((t) => t.taskId).sort()).toEqual([...completed].sort());

          // lastCompletedIndex is consistent
          const completedSet = new Set(completed);
          let expectedIdx = -1;
          for (let i = 0; i < planTaskIds.length; i++) {
            if (completedSet.has(planTaskIds[i])) {
              expectedIdx = i;
            }
          }
          expect(result.lastCompletedIndex).toBe(expectedIdx);
        },
      ),
      { numRuns: 40 },
    );
  });
});
