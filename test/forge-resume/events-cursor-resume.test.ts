import { describe, expect, it } from "vitest";
import {
  parseEventsNdjson,
  extractLatestCursor,
  type PhaseEvent,
} from "../../src/events-cursor.js";

function makeStartEvent(overrides: Partial<PhaseEvent> = {}): PhaseEvent {
  return {
    type: "phase_start",
    ts: "2026-05-16T10:00:00Z",
    phase: "build",
    iteration: 1,
    session_id: "sess-001",
    wall_clock_elapsed_seconds: 0,
    token_budget_used: 0,
    ...overrides,
  };
}

function makeEndEvent(overrides: Partial<PhaseEvent> = {}): PhaseEvent {
  return {
    type: "phase_end",
    ts: "2026-05-16T10:42:31Z",
    phase: "build",
    iteration: 1,
    session_id: "sess-001",
    exit_code: 0,
    wall_clock_elapsed_seconds: 2551,
    token_budget_used: 234500,
    ...overrides,
  };
}

function eventsToNdjson(events: PhaseEvent[]): string {
  return events.map((e) => JSON.stringify(e)).join("\n") + "\n";
}

describe("events-cursor", () => {
  describe("parseEventsNdjson", () => {
    it("parses valid phase_start/phase_end events", () => {
      const ndjson = eventsToNdjson([makeStartEvent(), makeEndEvent()]);
      const events = parseEventsNdjson(ndjson);
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe("phase_start");
      expect(events[1].type).toBe("phase_end");
    });

    it("validates phase_start schema — requires phase, iteration, session_id", () => {
      const bad = JSON.stringify({ type: "phase_start", ts: "2026-05-16T10:00:00Z" }) + "\n";
      const events = parseEventsNdjson(bad);
      expect(events).toHaveLength(0);
    });

    it("validates phase_end schema — requires exit_code", () => {
      const bad = JSON.stringify({ type: "phase_end", ts: "2026-05-16T10:00:00Z", phase: "build", iteration: 1, session_id: "s1" }) + "\n";
      const events = parseEventsNdjson(bad);
      expect(events).toHaveLength(0);
    });

    it("tolerates corrupted last line — skips and recovers", () => {
      const valid = eventsToNdjson([makeStartEvent(), makeEndEvent()]);
      const corrupted = valid + '{"type":"phase_start","ts":"2026-05';
      const events = parseEventsNdjson(corrupted);
      expect(events).toHaveLength(2);
    });

    it("session_id is unique across SKILL invocations", () => {
      const e1 = makeStartEvent({ session_id: "sess-001" });
      const e2 = makeStartEvent({ session_id: "sess-002", iteration: 2 });
      const ndjson = eventsToNdjson([e1, makeEndEvent(), e2]);
      const events = parseEventsNdjson(ndjson);
      const sessions = new Set(events.filter((e) => e.type === "phase_start").map((e) => e.session_id));
      expect(sessions.size).toBe(2);
    });
  });

  describe("extractLatestCursor", () => {
    it("returns latest phase_end as cursor", () => {
      const ndjson = eventsToNdjson([
        makeStartEvent({ phase: "plan", iteration: 1 }),
        makeEndEvent({ phase: "plan", iteration: 1 }),
        makeStartEvent({ phase: "build", iteration: 1 }),
        makeEndEvent({ phase: "build", iteration: 1, exit_code: 0 }),
      ]);
      const events = parseEventsNdjson(ndjson);
      const cursor = extractLatestCursor(events);
      expect(cursor).toBeDefined();
      expect(cursor!.phase).toBe("build");
      expect(cursor!.type).toBe("phase_end");
    });

    it("returns latest phase_start if no matching phase_end", () => {
      const ndjson = eventsToNdjson([
        makeStartEvent({ phase: "plan", iteration: 1 }),
        makeEndEvent({ phase: "plan", iteration: 1 }),
        makeStartEvent({ phase: "build", iteration: 1 }),
      ]);
      const events = parseEventsNdjson(ndjson);
      const cursor = extractLatestCursor(events);
      expect(cursor).toBeDefined();
      expect(cursor!.phase).toBe("build");
      expect(cursor!.type).toBe("phase_start");
    });

    it("returns undefined for empty events", () => {
      const cursor = extractLatestCursor([]);
      expect(cursor).toBeUndefined();
    });
  });
});
