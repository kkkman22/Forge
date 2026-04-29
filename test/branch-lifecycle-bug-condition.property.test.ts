/**
 * Property tests for Branch Lifecycle — Bug Condition Exploration.
 *
 * Property 1: Topic Mismatch Detection
 *   - extractBranchTopic correctly parses feature/<topic> and forge/<topic>
 *   - checkBranchTopicGate returns { allowed: false } when topics don't match
 *   - checkBranchTopicGate returns { allowed: true } when topics match
 *
 * Property 3: Pending-Delivery Recording
 *   - recordPendingDelivery preserves all fields in the returned record
 *
 * Property 4: Stale Branch Detection
 *   - detectStaleBranches returns exactly records whose topic differs from
 *     current topic AND timestamp is older than threshold
 *
 * Property 5: Cross-Topic Commit Prevention
 *   - checkCommitTopicMatch returns { allowed: false } when topics don't match
 *   - checkCommitTopicMatch returns { allowed: true } when topics match
 *
 * **Validates: Requirements from branch-lifecycle design document**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  checkBranchTopicGate,
  checkCommitTopicMatch,
  detectStaleBranches,
  detectUnshippedBranches,
  extractBranchTopic,
  recordPendingDelivery,
} from "../src/branch-lifecycle.js";
import type {
  BranchTopicGateResult,
  CommitTopicCheckResult,
  PendingDeliveryRecord,
} from "../src/loop-types.js";

// ---------------------------------------------------------------------------
// Generators — Shared
// ---------------------------------------------------------------------------

/** Generates a topic string: lowercase alphanumeric with hyphens, 1-20 chars. */
const topicArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789-"), {
    minLength: 1,
    maxLength: 20,
  })
  .map((chars) => chars.join(""))
  .filter((s: string) => !s.startsWith("-") && !s.endsWith("-") && !s.includes("--"));

/** Generates a branch name with valid format: feature/<topic> or forge/<topic>. */
const branchNameArb: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom("feature", "forge"), topicArb)
  .map(([prefix, topic]) => `${prefix}/${topic}`);

/** Generates a positive integer timestamp (milliseconds). */
const timestampArb: fc.Arbitrary<number> = fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER });

/** Generates a PendingDeliveryRecord. */
const _pendingDeliveryArb: fc.Arbitrary<PendingDeliveryRecord> = fc
  .tuple(branchNameArb, topicArb, timestampArb)
  .map(([branchName, topic, timestamp]) => ({
    branchName,
    topic,
    timestamp,
  }));

/**
 * Generates a (branchName, taskTopic) pair where topics DO match.
 * The topic is extracted from the branch name and used as the task topic.
 */
const matchedTopicPairArb: fc.Arbitrary<{ branchName: string; taskTopic: string }> =
  branchNameArb.chain((branchName) => {
    const topic = branchName.split("/").slice(1).join("/");
    return fc.constant({ branchName, taskTopic: topic });
  });

/**
 * Generates a (branchName, taskTopic) pair where topics DO NOT match.
 * Ensures the task topic is different from the branch's extracted topic.
 */
const mismatchedTopicPairArb: fc.Arbitrary<{ branchName: string; taskTopic: string }> = fc
  .tuple(branchNameArb, topicArb)
  .filter(([branchName, taskTopic]) => {
    const extracted = branchName.split("/").slice(1).join("/");
    return extracted !== taskTopic;
  })
  .map(([branchName, taskTopic]) => ({ branchName, taskTopic }));

/**
 * Generates a (branchName, commitTopic) pair where topics DO match.
 */
const matchedCommitPairArb: fc.Arbitrary<{ branchName: string; commitTopic: string }> =
  matchedTopicPairArb.map(({ branchName, taskTopic }) => ({
    branchName,
    commitTopic: taskTopic,
  }));

/**
 * Generates a (branchName, commitTopic) pair where topics DO NOT match.
 */
const mismatchedCommitPairArb: fc.Arbitrary<{ branchName: string; commitTopic: string }> =
  mismatchedTopicPairArb.map(({ branchName, taskTopic }) => ({
    branchName,
    commitTopic: taskTopic,
  }));

// ---------------------------------------------------------------------------
// Property 1: Topic Mismatch Detection
// ---------------------------------------------------------------------------

describe("Property 1: Topic Mismatch Detection", () => {
  it("extractBranchTopic returns correct topic for valid feature/<topic> branches", () => {
    fc.assert(
      fc.property(branchNameArb, (branchName) => {
        const expectedTopic = branchName.split("/").slice(1).join("/");
        const result = extractBranchTopic(branchName);

        expect(result).toBe(expectedTopic);
      }),
      { numRuns: 200 },
    );
  });

  it("extractBranchTopic returns null for non-feature/forge branches", () => {
    const nonBranchArb = fc.oneof(
      fc.constant("main"),
      fc.constant("develop"),
      fc.constant("release/1.0"),
      fc
        .string({ minLength: 1, maxLength: 20 })
        .filter((s) => !s.startsWith("feature/") && !s.startsWith("forge/")),
    );

    fc.assert(
      fc.property(nonBranchArb, (branchName) => {
        const result = extractBranchTopic(branchName);

        expect(result).toBeNull();
      }),
      { numRuns: 200 },
    );
  });

  it("checkBranchTopicGate allows when topics match", () => {
    fc.assert(
      fc.property(matchedTopicPairArb, ({ branchName, taskTopic }) => {
        const result: BranchTopicGateResult = checkBranchTopicGate(branchName, taskTopic);

        expect(result.allowed).toBe(true);
        expect(result.reasons).toHaveLength(0);
      }),
      { numRuns: 200 },
    );
  });

  it("checkBranchTopicGate blocks when topics do not match", () => {
    fc.assert(
      fc.property(mismatchedTopicPairArb, ({ branchName, taskTopic }) => {
        const result: BranchTopicGateResult = checkBranchTopicGate(branchName, taskTopic);

        expect(result.allowed).toBe(false);
        expect(result.reasons.length).toBeGreaterThan(0);
      }),
      { numRuns: 200 },
    );
  });

  it("checkBranchTopicGate blocks on non-feature/forge branch (main, develop, etc.)", () => {
    fc.assert(
      fc.property(topicArb, (taskTopic) => {
        const result: BranchTopicGateResult = checkBranchTopicGate("main", taskTopic);

        expect(result.allowed).toBe(false);
        expect(result.reasons.length).toBeGreaterThan(0);
      }),
      { numRuns: 200 },
    );
  });

  it("checkBranchTopicGate extracts nested topic from feature/foo/bar as 'foo/bar'", () => {
    const nestedBranch = "feature/foo/bar";
    const result: BranchTopicGateResult = checkBranchTopicGate(nestedBranch, "foo/bar");

    expect(result.allowed).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("checkBranchTopicGate blocks when nested topic does not match task topic", () => {
    const nestedBranch = "feature/foo/bar";
    const result: BranchTopicGateResult = checkBranchTopicGate(nestedBranch, "baz");

    expect(result.allowed).toBe(false);
    expect(result.reasons.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Property 3: Pending-Delivery Recording
// ---------------------------------------------------------------------------

describe("Property 3: Pending-Delivery Recording", () => {
  it("recordPendingDelivery preserves all input fields in the returned record", () => {
    fc.assert(
      fc.property(branchNameArb, topicArb, timestampArb, (branchName, topic, timestamp) => {
        const result: PendingDeliveryRecord = recordPendingDelivery(branchName, topic, timestamp);

        expect(result.branchName).toBe(branchName);
        expect(result.topic).toBe(topic);
        expect(result.timestamp).toBe(timestamp);
      }),
      { numRuns: 200 },
    );
  });

  it("recordPendingDelivery returns a record that equals an explicitly constructed one", () => {
    fc.assert(
      fc.property(branchNameArb, topicArb, timestampArb, (branchName, topic, timestamp) => {
        const result = recordPendingDelivery(branchName, topic, timestamp);
        const expected: PendingDeliveryRecord = { branchName, topic, timestamp };

        expect(result).toEqual(expected);
      }),
      { numRuns: 200 },
    );
  });

  it("recordPendingDelivery with forge/<topic> branch preserves the full branch name", () => {
    fc.assert(
      fc.property(topicArb, timestampArb, (topic, timestamp) => {
        const branchName = `forge/${topic}`;
        const result = recordPendingDelivery(branchName, topic, timestamp);

        expect(result.branchName).toBe(branchName);
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 4: Stale Branch Detection
// ---------------------------------------------------------------------------

describe("Property 4: Stale Branch Detection", () => {
  it("detectStaleBranches returns exactly records with different topic and older timestamp", () => {
    fc.assert(
      fc.property(
        topicArb,
        topicArb,
        timestampArb,
        fc.integer({ min: 1, max: 100000 }),
        (currentTopic, otherTopic, now, delta) => {
          fc.pre(currentTopic !== otherTopic);
          const threshold = 60000; // 1 minute in ms
          const staleTimestamp = now - threshold - delta;
          const freshTimestamp = now - threshold + delta + 1;

          const records: PendingDeliveryRecord[] = [
            // Stale: different topic, old timestamp
            { branchName: "feature/stale-1", topic: otherTopic, timestamp: staleTimestamp },
            // Not stale: same topic, old timestamp
            { branchName: "feature/current-1", topic: currentTopic, timestamp: staleTimestamp },
            // Not stale: different topic, fresh timestamp
            { branchName: "feature/other-fresh", topic: otherTopic, timestamp: freshTimestamp },
            // Not stale: same topic, fresh timestamp
            { branchName: "feature/current-fresh", topic: currentTopic, timestamp: freshTimestamp },
          ];

          const stale = detectStaleBranches(records, currentTopic, now, threshold);

          expect(stale).toHaveLength(1);
          expect(stale[0].branchName).toBe("feature/stale-1");
        },
      ),
      { numRuns: 200 },
    );
  });

  it("detectStaleBranches returns empty array when all records match current topic", () => {
    fc.assert(
      fc.property(
        topicArb,
        timestampArb,
        fc.array(timestampArb, { minLength: 0, maxLength: 10 }),
        (currentTopic, now, timestamps) => {
          const records: PendingDeliveryRecord[] = timestamps.map((ts, i) => ({
            branchName: `feature/branch-${i}`,
            topic: currentTopic,
            timestamp: ts,
          }));

          const stale = detectStaleBranches(records, currentTopic, now, 60000);

          expect(stale).toHaveLength(0);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("detectStaleBranches returns empty array when all records are within threshold", () => {
    fc.assert(
      fc.property(
        topicArb,
        topicArb,
        timestampArb,
        fc.integer({ min: 0, max: 59999 }),
        (currentTopic, otherTopic, now, withinThreshold) => {
          fc.pre(currentTopic !== otherTopic);
          const threshold = 60000;
          const recentTimestamp = now - withinThreshold;

          const records: PendingDeliveryRecord[] = [
            { branchName: "feature/recent-other", topic: otherTopic, timestamp: recentTimestamp },
          ];

          const stale = detectStaleBranches(records, currentTopic, now, threshold);

          expect(stale).toHaveLength(0);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("detectStaleBranches returns all records when all are stale", () => {
    fc.assert(
      fc.property(
        topicArb,
        fc
          .array(topicArb, { minLength: 1, maxLength: 10 })
          .filter((topics) => topics.every((t) => t !== "current-topic")),
        timestampArb,
        fc.integer({ min: 60001, max: 1000000 }),
        (_currentTopic, otherTopics, now, delta) => {
          const currentTopic = "current-topic";
          const threshold = 60000;

          const records: PendingDeliveryRecord[] = otherTopics.map((topic, i) => ({
            branchName: `feature/stale-${i}`,
            topic,
            timestamp: now - threshold - delta,
          }));

          const stale = detectStaleBranches(records, currentTopic, now, threshold);

          expect(stale).toHaveLength(otherTopics.length);
        },
      ),
      { numRuns: 200 },
    );
  });

  it("detectStaleBranches handles empty records array", () => {
    fc.assert(
      fc.property(topicArb, timestampArb, (currentTopic, now) => {
        const stale = detectStaleBranches([], currentTopic, now, 60000);

        expect(stale).toHaveLength(0);
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 5: Cross-Topic Commit Prevention
// ---------------------------------------------------------------------------

describe("Property 5: Cross-Topic Commit Prevention", () => {
  it("checkCommitTopicMatch allows when topics match", () => {
    fc.assert(
      fc.property(matchedCommitPairArb, ({ branchName, commitTopic }) => {
        const result: CommitTopicCheckResult = checkCommitTopicMatch(branchName, commitTopic);

        expect(result.allowed).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it("checkCommitTopicMatch blocks when topics do not match", () => {
    fc.assert(
      fc.property(mismatchedCommitPairArb, ({ branchName, commitTopic }) => {
        const result: CommitTopicCheckResult = checkCommitTopicMatch(branchName, commitTopic);

        expect(result.allowed).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it("checkCommitTopicMatch blocks on non-feature/forge branch", () => {
    fc.assert(
      fc.property(topicArb, (commitTopic) => {
        const result: CommitTopicCheckResult = checkCommitTopicMatch("main", commitTopic);

        expect(result.allowed).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it("checkCommitTopicMatch blocks on empty branch name", () => {
    fc.assert(
      fc.property(topicArb, (commitTopic) => {
        const result: CommitTopicCheckResult = checkCommitTopicMatch("", commitTopic);

        expect(result.allowed).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it("checkCommitTopicMatch with nested slash topic (feature/a/b) matches 'a/b'", () => {
    const result: CommitTopicCheckResult = checkCommitTopicMatch("feature/a/b", "a/b");

    expect(result.allowed).toBe(true);
  });

  it("checkCommitTopicMatch with nested slash topic does not match 'a'", () => {
    const result: CommitTopicCheckResult = checkCommitTopicMatch("feature/a/b", "a");

    expect(result.allowed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Property 6: detectUnshippedBranches
// ---------------------------------------------------------------------------

describe("Property 6: Unshipped Branch Detection", () => {
  it("detectUnshippedBranches returns warnings for different-topic records", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(branchNameArb, topicArb, timestampArb), { minLength: 1, maxLength: 10 }),
        topicArb,
        (records, currentTopic) => {
          fc.pre(records.some(([, topic]) => topic !== currentTopic));
          const pendingDeliveries: PendingDeliveryRecord[] = records.map(
            ([branchName, topic, timestamp]) => ({ branchName, topic, timestamp }),
          );

          const warnings = detectUnshippedBranches(pendingDeliveries, currentTopic);

          for (const w of warnings) {
            expect(w.topic).not.toBe(currentTopic);
            expect(w.branchName).toBeDefined();
            expect(w.timestamp).toBeTypeOf("number");
            expect(w.message).toContain(w.branchName);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("detectUnshippedBranches returns empty when all topics match", () => {
    fc.assert(
      fc.property(topicArb, timestampArb, (topic, timestamp) => {
        const pendingDeliveries: PendingDeliveryRecord[] = [
          { branchName: `feature/${topic}`, topic, timestamp },
        ];

        const warnings = detectUnshippedBranches(pendingDeliveries, topic);

        expect(warnings).toHaveLength(0);
      }),
      { numRuns: 200 },
    );
  });

  it("detectUnshippedBranches returns empty for empty input", () => {
    fc.assert(
      fc.property(topicArb, (currentTopic) => {
        const warnings = detectUnshippedBranches([], currentTopic);

        expect(warnings).toHaveLength(0);
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe("Edge cases", () => {
  it("extractBranchTopic returns null for empty string", () => {
    expect(extractBranchTopic("")).toBeNull();
  });

  it("detectStaleBranches with default thresholdMs (no fourth argument)", () => {
    const records: PendingDeliveryRecord[] = [
      { branchName: "feature/old-topic", topic: "old-topic", timestamp: 1000 },
    ];

    // Default thresholdMs=0: any different-topic record is stale regardless of time
    const stale = detectStaleBranches(records, "new-topic", 1000);

    expect(stale).toHaveLength(1);
  });
});
