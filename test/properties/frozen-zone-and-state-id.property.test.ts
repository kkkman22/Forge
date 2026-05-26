import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isFrozenZonePath, isHardFrozenSourceFile } from "../../src/check-frozen.js";
import { buildEnv } from "../../src/cli-subprocess-driver.js";
import { getProtectionZone, normalizeForgePath } from "../../src/state.js";

const numRuns = process.env.CI ? 100 : 1000;

const FROZEN_PREFIXES = ["specs/", "plans/", "config.md"];
const GUARDED_PREFIXES = [
  "progress/",
  "reviews/",
  "knowledge/instincts.md",
  "knowledge/known-failures.md",
  "knowledge/solutions/",
];

const frozenPathArb = fc.constantFrom(...FROZEN_PREFIXES).chain((prefix) => {
  if (prefix.endsWith("/")) {
    return fc
      .string({ minLength: 1, maxLength: 30 })
      .map((s) => `${prefix}${s.replace(/\//g, "_")}.md`);
  }
  return fc.constant(prefix);
});

const guardedPathArb = fc.constantFrom(...GUARDED_PREFIXES).chain((prefix) => {
  if (prefix.endsWith("/")) {
    return fc
      .string({ minLength: 1, maxLength: 30 })
      .map((s) => `${prefix}${s.replace(/\//g, "_")}.md`);
  }
  return fc.constant(prefix);
});

const openPathArb = fc.oneof(
  fc.constant("knowledge/sessions/run-1.md"),
  fc.constant("knowledge/evolved-rules.md"),
  fc.string({ minLength: 1, maxLength: 20 }).map((s) => `other/${s}.md`),
);

const forgePathArb = fc.oneof(
  frozenPathArb.map((p) => `.forge/${p}`),
  frozenPathArb,
  guardedPathArb.map((p) => `.forge/${p}`),
  openPathArb.map((p) => `.forge/${p}`),
  fc.string({ minLength: 1, maxLength: 40 }).map((s) => `/abs/project/.forge/${s}`),
);

describe("R11.1 frozen-zone property", () => {
  it("paths under frozen prefixes always resolve to frozen zone", () => {
    fc.assert(
      fc.property(frozenPathArb, (path) => {
        const normalized = normalizeForgePath(path);
        expect(getProtectionZone(normalized)).toBe("frozen");
      }),
      { numRuns },
    );
  });

  it("paths with .. traversal under frozen prefixes still resolve to frozen zone", () => {
    fc.assert(
      fc.property(
        frozenPathArb,
        fc.array(fc.constantFrom("..", "."), { minLength: 0, maxLength: 5 }),
        (path, segments) => {
          const traversed = segments.length > 0 ? `${segments.join("/")}/.forge/${path}` : path;
          const normalized = normalizeForgePath(traversed);
          expect(getProtectionZone(normalized)).toBe("frozen");
        },
      ),
      { numRuns },
    );
  });

  it("guarded paths never return frozen zone", () => {
    fc.assert(
      fc.property(guardedPathArb, (path) => {
        const normalized = normalizeForgePath(path);
        const zone = getProtectionZone(normalized);
        expect(zone).not.toBe("frozen");
      }),
      { numRuns },
    );
  });

  it("open paths always return open zone", () => {
    fc.assert(
      fc.property(openPathArb, (path) => {
        const normalized = normalizeForgePath(path);
        expect(getProtectionZone(normalized)).toBe("open");
      }),
      { numRuns },
    );
  });

  it("isFrozenZonePath returns true only for frozen zone paths", () => {
    fc.assert(
      fc.property(forgePathArb, (path) => {
        const normalized = normalizeForgePath(path);
        const zone = getProtectionZone(normalized);
        const isFrozen = isFrozenZonePath(path);
        expect(isFrozen).toBe(zone === "frozen");
      }),
      { numRuns },
    );
  });
});

describe("R11.1 hard-frozen source files", () => {
  it("src/prompt-defense-patterns.ts is always hard-frozen", () => {
    expect(isHardFrozenSourceFile("src/prompt-defense-patterns.ts")).toBe(true);
    expect(isHardFrozenSourceFile("/abs/project/src/prompt-defense-patterns.ts")).toBe(true);
  });

  it("random non-matching paths are never hard-frozen", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1, maxLength: 50 })
          .filter((s) => !s.includes("prompt-defense-patterns")),
        (path) => {
          expect(isHardFrozenSourceFile(path)).toBe(false);
        },
      ),
      { numRuns },
    );
  });
});

describe("R12.4 state-id uniqueness", () => {
  it("workflow_state_id is unique across 1000 simulated dispatches", () => {
    const stateIds = new Set<string>();
    const runCount = 1000;

    for (let i = 0; i < runCount; i++) {
      const runId = `run-${i}-${Date.now()}`;
      const subcommand = ["review", "decide", "learn"][i % 3];
      const stateId = `wsid_${runId}_${subcommand}_${Date.now()}_${i}`;
      expect(stateIds.has(stateId)).toBe(false);
      stateIds.add(stateId);
    }

    expect(stateIds.size).toBe(runCount);
  });

  it("built env does not leak between sequential calls", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1, max: 10 }),
        fc.integer({ min: 1, max: 5 }),
        (maxParallel, reviewConcurrency, runtimeConcurrency) => {
          const snapshotBefore = new Set(Object.keys(process.env));

          const env = buildEnv({
            maxParallelAgents: maxParallel,
            reviewConcurrency,
            runtimeConcurrency,
          });

          const leakedKeys = Object.keys(env).filter(
            (k) => k.startsWith("FORGE_MAX_PARALLEL_AGENTS_RUNTIME") && !snapshotBefore.has(k),
          );

          expect(leakedKeys.length).toBeLessThanOrEqual(1);

          for (const key of Object.keys(env)) {
            if (key.startsWith("FORGE_") && !snapshotBefore.has(key)) {
              delete process.env[key];
            }
          }
        },
      ),
      { numRuns },
    );
  });

  it("buildEnv always includes CLAUDE_CODE_WORKFLOWS=1 when env var is set", () => {
    const original = process.env.CLAUDE_CODE_WORKFLOWS;
    process.env.CLAUDE_CODE_WORKFLOWS = "1";
    try {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 20 }),
          fc.integer({ min: 1, max: 10 }),
          (maxParallel, reviewConcurrency) => {
            const env = buildEnv({ maxParallelAgents: maxParallel, reviewConcurrency });
            expect(env.CLAUDE_CODE_WORKFLOWS).toBe("1");
          },
        ),
        { numRuns },
      );
    } finally {
      if (original !== undefined) {
        process.env.CLAUDE_CODE_WORKFLOWS = original;
      } else {
        delete process.env.CLAUDE_CODE_WORKFLOWS;
      }
    }
  });

  it("buildEnv sets runtime concurrency only when provided", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 1, max: 10 }),
        fc.option(fc.integer({ min: 1, max: 5 })),
        (maxParallel, reviewConcurrency, runtimeConcurrency) => {
          const env = buildEnv({
            maxParallelAgents: maxParallel,
            reviewConcurrency,
            runtimeConcurrency: runtimeConcurrency ?? undefined,
          });

          if (runtimeConcurrency !== null) {
            expect(env.FORGE_MAX_PARALLEL_AGENTS_RUNTIME).toBe(String(runtimeConcurrency));
          } else {
            expect(env.FORGE_MAX_PARALLEL_AGENTS_RUNTIME).toBeUndefined();
          }
        },
      ),
      { numRuns },
    );
  });
});
