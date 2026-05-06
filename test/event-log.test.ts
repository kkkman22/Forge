/**
 * Unit tests for `src/event-log.ts`.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.8, 3.9**
 */

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
import { createInitialState } from "../src/orchestrator.js";

function initialState(): OrchestratorState {
  return createInitialState();
}

describe("stableStringify", () => {
  it("is insensitive to object key order", () => {
    const a = { x: 1, y: 2, z: 3 };
    const b = { z: 3, y: 2, x: 1 };
    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it("preserves array order", () => {
    expect(stableStringify([1, 2, 3])).toBe("[1,2,3]");
    expect(stableStringify([1, 2, 3])).not.toBe(stableStringify([3, 2, 1]));
  });

  it("handles nested objects stably", () => {
    const a = { outer: { a: 1, b: 2 } };
    const b = { outer: { b: 2, a: 1 } };
    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it("serializes primitives and null", () => {
    expect(stableStringify(null)).toBe("null");
    expect(stableStringify(undefined)).toBe("null");
    expect(stableStringify(42)).toBe("42");
    expect(stableStringify("hi")).toBe('"hi"');
    expect(stableStringify(true)).toBe("true");
  });
});

describe("hashState", () => {
  it("yields 16 hex characters", () => {
    const hash = hashState(initialState());
    expect(hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it("produces the same hash for the same state", () => {
    expect(hashState(initialState())).toBe(hashState(initialState()));
  });

  it("produces different hashes for different states", () => {
    const a = initialState();
    const b = { ...initialState(), currentIteration: 5 };
    expect(hashState(a)).not.toBe(hashState(b));
  });
});

describe("buildEntry / serializeEntry / parseEventLog", () => {
  it("round-trips an entry through JSONL serialization", () => {
    const before = initialState();
    const event: OrchestratorEvent = { type: "start", limits: {} };
    const entry = buildEntry("run-1", 0, event, before, before, [], "2026-05-06T10:00:00.000Z");

    const line = serializeEntry(entry);
    const parsed = parseEventLog(line);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toEqual(entry);
  });

  it("skips blank lines and preserves order", () => {
    const before = initialState();
    const event: OrchestratorEvent = { type: "start", limits: {} };
    const e1 = buildEntry("r", 0, event, before, before, [], "2026-05-06T10:00:00.000Z");
    const e2 = buildEntry("r", 1, event, before, before, [], "2026-05-06T10:00:01.000Z");
    const jsonl = `${serializeEntry(e1)}\n\n${serializeEntry(e2)}\n`;
    const parsed = parseEventLog(jsonl);
    expect(parsed).toEqual([e1, e2]);
  });

  it("raises a descriptive error on malformed lines", () => {
    expect(() => parseEventLog('{"timestamp":')).toThrow(/line 1/);
  });
});

describe("replay", () => {
  it("replays empty entry list → original state", () => {
    const initial = initialState();
    expect(replay(initial, [])).toEqual(initial);
  });

  it("replays a start event to running state", () => {
    const initial = initialState();
    const event: OrchestratorEvent = { type: "start", limits: {} };
    const entry = buildEntry("r", 0, event, initial, initial, []);
    const replayed = replay(initial, [entry]);
    expect(replayed.status).toBe("running");
  });

  it("hashState(replay(initial, entries)) === stateHashAfter of last entry", () => {
    const initial = initialState();
    const startEvent: OrchestratorEvent = { type: "start", limits: {} };
    const start = { state: initial, effects: [] };
    // We build the entry using the same pre/post-hash convention the driver will use.
    const entry = buildEntry(
      "r",
      0,
      startEvent,
      start.state,
      // Simulate the state that the transition would produce.
      { ...initial, status: "running", currentIteration: 0 },
      [],
    );
    const replayed = replay(initial, [entry]);
    expect(hashState(replayed)).toBe(entry.stateHashAfter);
  });
});
