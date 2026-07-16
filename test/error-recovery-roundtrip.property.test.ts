/**
 * Property-based tests for serialization round-trips.
 *
 * Covers Properties 16-18: RecoveryReport, InterruptionClassification,
 * and CheckpointMarker round-trip consistency.
 *
 * Feature: error-recovery-strategy
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  type CheckpointMarker,
  deserializeCheckpointMarker,
  deserializeClassification,
  deserializeRecoveryReport,
  type InterruptionCategory,
  type InterruptionClassification,
  type RecoveryReport,
  serializeCheckpointMarker,
  serializeClassification,
  serializeRecoveryReport,
  type TDDInterruptionPhase,
} from "../src/error-recovery.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const actionOption = () =>
  fc.record({
    index: fc.integer({ min: 1, max: 5 }),
    description: safeStr(1, 50).filter((s) => s.length > 0),
    isDefault: fc.boolean(),
  });

const inconsistencyItem = () =>
  fc.record({
    category: safeStr(1, 30).filter((s) => s.length > 0),
    evidence: safeStr(1, 80).filter((s) => s.length > 0),
    recommendedAction: safeStr(1, 60).filter((s) => s.length > 0),
  });

const safeStr = (min: number, max: number) =>
  fc.array(safeChar, { minLength: min, maxLength: max }).map((a) => a.join("").trim());

const recoveryReport = (): fc.Arbitrary<RecoveryReport> =>
  fc.record({
    header: fc.record({
      taskName: safeStr(1, 30).filter((s) => s.length > 0),
      tier: fc.constantFrom("light", "standard", "full"),
      phase: fc.constantFrom("decide", "spec", "plan", "build", "review", "test", "ship", "learn"),
      lastUpdate: safeStr(1, 30).filter((s) => s.length > 0),
      interruptionCategory: fc.constantFrom(
        "task-completed-not-committed",
        "committed-not-progress-updated",
        "progress-updated-not-phase-advanced",
        "subagent-mid-execution",
        "clean-state",
      ) as fc.Arbitrary<InterruptionCategory>,
    }),
    inconsistencies: fc.array(inconsistencyItem(), { minLength: 0, maxLength: 5 }),
    actions: fc.array(fc.array(actionOption(), { minLength: 1, maxLength: 3 }), {
      minLength: 0,
      maxLength: 5,
    }),
    summary: fc.record({
      totalInconsistencies: fc.integer({ min: 0, max: 10 }),
      autoFixable: fc.integer({ min: 0, max: 10 }),
      requiresUserDecision: fc.integer({ min: 0, max: 10 }),
    }),
  });

const interruptionClassification = (): fc.Arbitrary<InterruptionClassification> =>
  fc.record({
    category: fc.constantFrom(
      "task-completed-not-committed",
      "committed-not-progress-updated",
      "progress-updated-not-phase-advanced",
      "subagent-mid-execution",
      "clean-state",
    ) as fc.Arbitrary<InterruptionCategory>,
    evidence: safeStr(1, 80).filter((s) => s.length > 0),
    tddPhase: fc.oneof(
      fc.constant(null),
      fc.constantFrom(
        "red",
        "green-incomplete",
        "refactor-incomplete",
      ) as fc.Arbitrary<TDDInterruptionPhase>,
    ),
  });

const safeChar = fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789_- ".split(""));
const safeCharNoSpace = fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789_-".split(""));

const checkpointMarker = (): fc.Arbitrary<CheckpointMarker> =>
  fc
    .record({
      taskId: fc
        .array(safeCharNoSpace, { minLength: 1, maxLength: 10 })
        .map((a) => a.join("").trim()),
      intendedCommitMessage: fc
        .array(safeChar, { minLength: 1, maxLength: 60 })
        .map((a) => a.join("").trim()),
      timestamp: fc
        .array(safeCharNoSpace, { minLength: 1, maxLength: 30 })
        .map((a) => a.join("").trim()),
    })
    .filter(
      (m) => m.taskId.length > 0 && m.intendedCommitMessage.length > 0 && m.timestamp.length > 0,
    );

// ---------------------------------------------------------------------------
// Property 16: RecoveryReport round-trip
// ---------------------------------------------------------------------------

describe("Feature: error-recovery-strategy, Property 16: RecoveryReport round-trip", () => {
  it("serialize then deserialize yields semantically equivalent object", () => {
    fc.assert(
      fc.property(recoveryReport(), (report) => {
        const serialized = serializeRecoveryReport(report);
        const deserialized = deserializeRecoveryReport(serialized);

        // Header fields match
        expect(deserialized.header.taskName).toBe(report.header.taskName);
        expect(deserialized.header.tier).toBe(report.header.tier);
        expect(deserialized.header.phase).toBe(report.header.phase);
        expect(deserialized.header.lastUpdate).toBe(report.header.lastUpdate);
        expect(deserialized.header.interruptionCategory).toBe(report.header.interruptionCategory);

        // Inconsistency count matches
        expect(deserialized.inconsistencies.length).toBe(report.inconsistencies.length);

        // Summary counts match
        expect(deserialized.summary.totalInconsistencies).toBe(report.summary.totalInconsistencies);
        expect(deserialized.summary.autoFixable).toBe(report.summary.autoFixable);
        expect(deserialized.summary.requiresUserDecision).toBe(report.summary.requiresUserDecision);
      }),
      { numRuns: 40 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 17: InterruptionClassification round-trip
// ---------------------------------------------------------------------------

describe("Feature: error-recovery-strategy, Property 17: InterruptionClassification round-trip", () => {
  it("serialize then deserialize yields semantically equivalent object", () => {
    fc.assert(
      fc.property(interruptionClassification(), (classification) => {
        const serialized = serializeClassification(classification);
        const deserialized = deserializeClassification(serialized);

        expect(deserialized.category).toBe(classification.category);
        expect(deserialized.evidence).toBe(classification.evidence);
        expect(deserialized.tddPhase).toBe(classification.tddPhase);
      }),
      { numRuns: 40 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 18: CheckpointMarker round-trip
// ---------------------------------------------------------------------------

describe("Feature: error-recovery-strategy, Property 18: CheckpointMarker round-trip", () => {
  it("serialize then deserialize yields semantically equivalent object", () => {
    fc.assert(
      fc.property(checkpointMarker(), (marker) => {
        const serialized = serializeCheckpointMarker(marker);
        const deserialized = deserializeCheckpointMarker(serialized);

        expect(deserialized.taskId).toBe(marker.taskId);
        expect(deserialized.intendedCommitMessage).toBe(marker.intendedCommitMessage);
        expect(deserialized.timestamp).toBe(marker.timestamp);
      }),
      { numRuns: 40 },
    );
  });
});
