/**
 * F7 / R12.5 — concurrency-bridge degradation ladder.
 *
 * Forge_Subcommand_Dispatcher observes `status_code=429` / `subtype=rate_limit`
 * events from the L0 stream-json output and steps `chunkedParallel`'s
 * `maxConcurrency` down a 3-step ladder per /forge subcommand:
 *
 *   1st 429: floor(current / 2)
 *   2nd 429: 2
 *   3rd 429: 1 (serial)
 *
 * Each step injects FORGE_MAX_PARALLEL_AGENTS_RUNTIME into the next child
 * process env and appends a `429-degrade` record to tool-health.md. The
 * runtime override is reset when the /forge subcommand finishes.
 */

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildSpawnEnv,
  ConcurrencyDegradationLadder,
  observe429,
  type StreamEvent,
} from "../../src/concurrency-bridge.js";

let tmpRoot: string;
let healthPath: string;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "concurrency-bridge-"));
  healthPath = join(tmpRoot, ".forge", "knowledge", "tool-health.md");
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

describe("ConcurrencyDegradationLadder: 3-step 429 ladder (R12.5)", () => {
  it("starts at the configured baseline and reports no override", () => {
    const ladder = new ConcurrencyDegradationLadder({
      baseline: 6,
      subcommand: "review",
      toolHealthPath: healthPath,
    });
    expect(ladder.current()).toBe(6);
    expect(ladder.runtimeOverride()).toBeUndefined();
    expect(ladder.degradationCount()).toBe(0);
  });

  it("step 1: halves baseline (6 → 3, floor); step 2: 2; step 3: 1", () => {
    const ladder = new ConcurrencyDegradationLadder({
      baseline: 6,
      subcommand: "review",
      toolHealthPath: healthPath,
    });
    expect(ladder.degrade()).toBe(3);
    expect(ladder.runtimeOverride()).toBe(3);
    expect(ladder.degrade()).toBe(2);
    expect(ladder.runtimeOverride()).toBe(2);
    expect(ladder.degrade()).toBe(1);
    expect(ladder.runtimeOverride()).toBe(1);
  });

  it("step 1: halves odd baseline with floor (5 → 2, since floor(5/2)=2)", () => {
    const ladder = new ConcurrencyDegradationLadder({
      baseline: 5,
      subcommand: "review",
      toolHealthPath: healthPath,
    });
    expect(ladder.degrade()).toBe(2);
  });

  it("further degrade calls past step 3 stay clamped at 1", () => {
    const ladder = new ConcurrencyDegradationLadder({
      baseline: 6,
      subcommand: "review",
      toolHealthPath: healthPath,
    });
    ladder.degrade();
    ladder.degrade();
    ladder.degrade();
    expect(ladder.degrade()).toBe(1);
    expect(ladder.runtimeOverride()).toBe(1);
  });

  it("reset() clears the runtime override (per /forge subcommand boundary)", () => {
    const ladder = new ConcurrencyDegradationLadder({
      baseline: 6,
      subcommand: "review",
      toolHealthPath: healthPath,
    });
    ladder.degrade();
    expect(ladder.runtimeOverride()).toBe(3);
    ladder.reset();
    expect(ladder.runtimeOverride()).toBeUndefined();
    expect(ladder.degradationCount()).toBe(0);
    expect(ladder.current()).toBe(6);
  });

  it("each degrade appends a `429-degrade` line to tool-health.md (R12.6 schema)", () => {
    const ladder = new ConcurrencyDegradationLadder({
      baseline: 6,
      subcommand: "review",
      toolHealthPath: healthPath,
      probe: "a",
    });
    ladder.degrade();
    ladder.degrade();
    ladder.degrade();
    const content = readFileSync(healthPath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines).toHaveLength(3);
    const SCHEMA = /^[^ ]+ · review · 429-degrade · old=\d+ new=\d+ probe=a$/;
    for (const l of lines) expect(l).toMatch(SCHEMA);
    expect(lines[0]).toContain("old=6 new=3");
    expect(lines[1]).toContain("old=3 new=2");
    expect(lines[2]).toContain("old=2 new=1");
  });

  it("default probe is `none` when not configured", () => {
    const ladder = new ConcurrencyDegradationLadder({
      baseline: 6,
      subcommand: "decide",
      toolHealthPath: healthPath,
    });
    ladder.degrade();
    const content = readFileSync(healthPath, "utf-8");
    expect(content.trim()).toMatch(/probe=none$/);
  });
});

describe("observe429: classifies stream events", () => {
  it("returns true for tool_result with status_code=429", () => {
    const ev: StreamEvent = {
      type: "tool_result",
      status_code: 429,
    };
    expect(observe429(ev)).toBe(true);
  });

  it("returns true for result with subtype=rate_limit", () => {
    const ev: StreamEvent = {
      type: "result",
      subtype: "rate_limit",
    };
    expect(observe429(ev)).toBe(true);
  });

  it("returns false for normal assistant messages", () => {
    expect(observe429({ type: "assistant" })).toBe(false);
    expect(observe429({ type: "result", subtype: "success" })).toBe(false);
    expect(observe429({ type: "tool_result", status_code: 200 })).toBe(false);
  });

  it("returns false for null / non-object input", () => {
    expect(observe429(null)).toBe(false);
    expect(observe429(undefined)).toBe(false);
    expect(observe429("not-an-event")).toBe(false);
  });
});

describe("buildSpawnEnv: env passthrough for workflow subprocess (R12.6)", () => {
  it("sets FORGE_MAX_PARALLEL_AGENTS, FORGE_REVIEW_CONCURRENCY, FORGE_MAX_PARALLEL_AGENTS_RUNTIME", () => {
    const env = buildSpawnEnv({
      maxParallelAgents: 6,
      reviewConcurrency: 3,
      runtimeOverride: 3,
      baseEnv: {},
    });
    expect(env.FORGE_MAX_PARALLEL_AGENTS).toBe("6");
    expect(env.FORGE_REVIEW_CONCURRENCY).toBe("3");
    expect(env.FORGE_MAX_PARALLEL_AGENTS_RUNTIME).toBe("3");
  });

  it("omits FORGE_MAX_PARALLEL_AGENTS_RUNTIME when no override active", () => {
    const env = buildSpawnEnv({
      maxParallelAgents: 6,
      reviewConcurrency: 3,
      baseEnv: {},
    });
    expect(env.FORGE_MAX_PARALLEL_AGENTS).toBe("6");
    expect(env.FORGE_REVIEW_CONCURRENCY).toBe("3");
    expect(env).not.toHaveProperty("FORGE_MAX_PARALLEL_AGENTS_RUNTIME");
  });

  it("does not mutate the caller's baseEnv", () => {
    const base: Record<string, string> = { PATH: "/usr/bin" };
    buildSpawnEnv({
      maxParallelAgents: 6,
      reviewConcurrency: 3,
      baseEnv: base,
    });
    expect(Object.keys(base)).toEqual(["PATH"]);
  });
});

describe("Integration: 3 consecutive 429 events drive the ladder end-to-end (R12.5)", () => {
  it("writes 3 tool-health records and emits matching env values for each subprocess respawn", () => {
    const ladder = new ConcurrencyDegradationLadder({
      baseline: 6,
      subcommand: "review",
      toolHealthPath: healthPath,
      probe: "b",
    });

    const respawnEnvs: Array<Record<string, string>> = [];
    for (const ev of [
      { type: "tool_result", status_code: 429 },
      { type: "result", subtype: "rate_limit" },
      { type: "tool_result", status_code: 429 },
    ] as StreamEvent[]) {
      if (observe429(ev)) {
        ladder.degrade();
        respawnEnvs.push(
          buildSpawnEnv({
            maxParallelAgents: 6,
            reviewConcurrency: 3,
            runtimeOverride: ladder.runtimeOverride(),
            baseEnv: {},
          }),
        );
      }
    }

    expect(respawnEnvs).toHaveLength(3);
    expect(respawnEnvs[0]?.FORGE_MAX_PARALLEL_AGENTS_RUNTIME).toBe("3");
    expect(respawnEnvs[1]?.FORGE_MAX_PARALLEL_AGENTS_RUNTIME).toBe("2");
    expect(respawnEnvs[2]?.FORGE_MAX_PARALLEL_AGENTS_RUNTIME).toBe("1");

    const lines = readFileSync(healthPath, "utf-8").trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("old=6 new=3 probe=b");
    expect(lines[1]).toContain("old=3 new=2 probe=b");
    expect(lines[2]).toContain("old=2 new=1 probe=b");
  });
});
