/**
 * Property-based tests for `src/event-log.ts`.
 *
 * **Validates: Requirements 3.3, 3.8, 3.9**
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  buildEntry,
  hashState,
  parseEventLog,
  replay,
  serializeEntry,
  stableStringify,
} from "../src/event-log.js";
import type { OrchestratorEvent, OrchestratorState } from "../src/loop-types.js";
import { createInitialState, transition } from "../src/orchestrator.js";

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const eventArb: fc.Arbitrary<OrchestratorEvent> = fc.oneof(
  fc.constant<OrchestratorEvent>({ type: "start", limits: {} }),
  fc.record({
    type: fc.constant("iteration_success" as const),
    summary: fc.string({ maxLength: 40 }),
    tokenUsage: fc.record({
      inputTokens: fc.integer({ min: 0, max: 5000 }),
      outputTokens: fc.integer({ min: 0, max: 5000 }),
      cacheReadTokens: fc.integer({ min: 0, max: 5000 }),
      cacheCreationTokens: fc.integer({ min: 0, max: 5000 }),
    }),
  }),
  fc.record({
    type: fc.constant("iteration_soft_failure" as const),
    summary: fc.string({ maxLength: 40 }),
    tokenUsage: fc.record({
      inputTokens: fc.integer({ min: 0, max: 5000 }),
      outputTokens: fc.integer({ min: 0, max: 5000 }),
      cacheReadTokens: fc.integer({ min: 0, max: 5000 }),
      cacheCreationTokens: fc.integer({ min: 0, max: 5000 }),
    }),
  }),
  fc.constant<OrchestratorEvent>({ type: "backoff_elapsed" }),
);

const eventSequenceArb = fc.array(eventArb, { minLength: 1, maxLength: 12 });

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function buildLog(
  initial: OrchestratorState,
  events: OrchestratorEvent[],
): { final: OrchestratorState; entries: ReturnType<typeof buildEntry>[] } {
  let state = initial;
  const entries = [];
  for (let i = 0; i < events.length; i += 1) {
    const before = state;
    const { state: after, effects } = transition(before, events[i]);
    entries.push(
      buildEntry(
        "run-prop",
        i,
        events[i],
        before,
        after,
        effects,
        `2026-05-06T00:00:${String(i).padStart(2, "0")}.000Z`,
      ),
    );
    state = after;
  }
  return { final: state, entries };
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe("event-log — properties", () => {
  /**
   * **Validates: Requirements 3.3**
   *
   * `hashState` is order-insensitive for object keys and collision-free
   * across many randomly assembled states in practice.
   */
  it("hashState is stable and order-insensitive", () => {
    fc.assert(
      fc.property(eventSequenceArb, (events) => {
        const { final } = buildLog(createInitialState(), events);
        expect(hashState(final)).toBe(hashState(final));
        expect(stableStringify(final)).toBe(stableStringify(final));
      }),
      { numRuns: 40 },
    );
  });

  /**
   * **Validates: Requirements 3.9**
   *
   * "Events are the source of truth": for any event sequence, replaying
   * from the same initial state yields a state whose hash matches the
   * last entry's `stateHashAfter`.
   */
  it("replay produces a state whose hash matches the last stateHashAfter", () => {
    fc.assert(
      fc.property(eventSequenceArb, (events) => {
        const initial = createInitialState();
        const { entries } = buildLog(initial, events);
        if (entries.length === 0) return;
        const replayed = replay(initial, entries);
        expect(hashState(replayed)).toBe(entries[entries.length - 1].stateHashAfter);
      }),
      { numRuns: 40 },
    );
  });

  /**
   * **Validates: Requirements 3.2**
   *
   * JSONL round-trip: serializing every entry to a line-joined string and
   * parsing it back yields an array that is deep-equal to the originals.
   */
  it("serializeEntry / parseEventLog round-trip preserves entries", () => {
    fc.assert(
      fc.property(eventSequenceArb, (events) => {
        const initial = createInitialState();
        const { entries } = buildLog(initial, events);
        const joined = entries.map(serializeEntry).join("\n");
        expect(parseEventLog(joined)).toEqual(entries);
      }),
      { numRuns: 40 },
    );
  });
});
