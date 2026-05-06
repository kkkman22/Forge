/**
 * Unit tests for `validateResume` and `EventLogReplayError`.
 *
 * **Validates: Requirement 3.7**
 */

import { describe, expect, it } from "vitest";
import { buildEntry, hashState, replay, validateResume } from "../src/event-log.js";
import { EventLogReplayError, ForgeError } from "../src/forge-error.js";
import type { OrchestratorEvent } from "../src/loop-types.js";
import { createInitialState, transition } from "../src/orchestrator.js";

describe("validateResume", () => {
  it("returns the replayed state when the hash matches", () => {
    const initial = createInitialState();
    const event: OrchestratorEvent = { type: "start", limits: {} };
    const { state: after, effects } = transition(initial, event);
    const entry = buildEntry("r", 0, event, initial, after, effects);
    const replayed = validateResume(initial, [entry], hashState(after));
    expect(replayed).toEqual(after);
  });

  it("throws EventLogReplayError when the hash does not match", () => {
    const initial = createInitialState();
    const event: OrchestratorEvent = { type: "start", limits: {} };
    const { state: after, effects } = transition(initial, event);
    const entry = buildEntry("r", 0, event, initial, after, effects);
    const wrongHash = "deadbeefdeadbeef";
    try {
      validateResume(initial, [entry], wrongHash);
      throw new Error("expected EventLogReplayError");
    } catch (err) {
      expect(err).toBeInstanceOf(ForgeError);
      expect(err).toBeInstanceOf(EventLogReplayError);
      const e = err as EventLogReplayError;
      expect(e.code).toBe("EVENT_LOG_REPLAY_MISMATCH");
      expect(e.expectedHash).toBe(wrongHash);
      expect(e.actualHash).toBe(hashState(after));
    }
  });

  it("handles an empty event list by returning the initial state", () => {
    const initial = createInitialState();
    const replayed = validateResume(initial, [], hashState(initial));
    expect(replayed).toEqual(initial);
    expect(replay(initial, [])).toEqual(initial);
  });
});
