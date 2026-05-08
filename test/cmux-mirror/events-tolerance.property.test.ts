import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readEventsSince } from "../../scripts/cmux-mirror/lib/events.mjs";

const FIXTURE = join(__dirname, "fixtures", "events-session.ndjson");
let tmpDir: string;

beforeEach(() => {
  tmpDir = join(tmpdir(), `cmux-events-test-${Date.now()}`);
  mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("events: tolerance and cursor property tests (R12.11, R14.6, R14.9)", () => {
  it("reads all valid lines from well-formed NDJSON", async () => {
    const { events } = await readEventsSince(FIXTURE, 0);
    expect(events.length).toBe(8);
    expect(events[0].type).toBe("session_started");
    expect(events[7].type).toBe("loop_terminated");
  });

  it("cursor advances past all bytes consumed", async () => {
    const { cursor: c1 } = await readEventsSince(FIXTURE, 0);
    const { events: e2 } = await readEventsSince(FIXTURE, c1);
    expect(e2.length).toBe(0);
  });

  it("skips malformed lines without throwing (R12.11)", async () => {
    const file = join(tmpDir, "mixed.ndjson");
    writeFileSync(
      file,
      `${[
        `{"schema_version":1,"ts":"2026-01-01T00:00:00Z","type":"session_started"}`,
        `BROKEN LINE`,
        ``,
        `{"schema_version":1,"ts":"2026-01-01T00:01:00Z","type":"iter_started"}`,
      ].join("\n")}\n`,
    );

    const { events } = await readEventsSince(file, 0);
    expect(events.length).toBe(2);
    expect(events[0].type).toBe("session_started");
    expect(events[1].type).toBe("iter_started");
  });

  it("filters by schema_version when specified (R14.9)", async () => {
    const file = join(tmpDir, "multi-schema.ndjson");
    writeFileSync(
      file,
      `${[
        `{"schema_version":1,"ts":"2026-01-01T00:00:00Z","type":"session_started"}`,
        `{"schema_version":2,"ts":"2026-01-01T00:01:00Z","type":"future_event"}`,
        `{"schema_version":1,"ts":"2026-01-01T00:02:00Z","type":"iter_started"}`,
      ].join("\n")}\n`,
    );

    const { events } = await readEventsSince(file, 0, { schemaVersion: 1 });
    expect(events.length).toBe(2);
    expect(events.every((e) => e.schema_version === 1)).toBe(true);
  });

  it("returns empty events for non-existent file", async () => {
    const { events, cursor } = await readEventsSince(join(tmpDir, "nope.ndjson"), 0);
    expect(events).toEqual([]);
    expect(cursor).toBe(0);
  });

  it("property: any sequence of lines produces valid cursor progression", async () => {
    const lineArb = fc.oneof(
      fc.constant('{"schema_version":1,"ts":"2026-01-01T00:00:00Z","type":"test"}'),
      fc.constant("NOT JSON"),
      fc.constant(""),
      fc.string({ minLength: 1, maxLength: 50 }),
    );

    await fc.assert(
      fc.asyncProperty(fc.array(lineArb, { maxLength: 20 }), async (lines) => {
        const file = join(tmpDir, "prop.ndjson");
        writeFileSync(file, `${lines.join("\n")}\n`);

        const { cursor, events } = await readEventsSince(file, 0);
        expect(typeof cursor).toBe("number");
        expect(cursor).toBeGreaterThanOrEqual(0);
        expect(Array.isArray(events)).toBe(true);

        // Reading again from cursor yields 0 events
        const { events: e2 } = await readEventsSince(file, cursor);
        expect(e2.length).toBe(0);
      }),
    );
  });
});
