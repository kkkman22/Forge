/**
 * T-18: Wave scheduling — parseWaves, computeDependencyClosure.
 * T-19: Single-task mode — dependency closure computation.
 *
 * Validates: Requirements 4
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { TaskSeed } from "../src/spec-bundle.js";
import { computeDependencyClosure, parseWaves } from "../src/spec-wave.js";

function makeTask(id: string, deps?: string[]): TaskSeed {
  return {
    id,
    title: id,
    goal: `Goal ${id}`,
    related_requirements: [],
    status: "pending",
    depends_on: deps,
  };
}

// ---------------------------------------------------------------------------
// parseWaves
// ---------------------------------------------------------------------------

describe("parseWaves", () => {
  it("parses valid JSON wave block", () => {
    const tasks = [makeTask("T-01"), makeTask("T-02", ["T-01"])];
    const jsonBlock = JSON.stringify({
      waves: [
        { wave: 1, tasks: ["T-01"] },
        { wave: 2, tasks: ["T-02"] },
      ],
    });

    const waves = parseWaves(jsonBlock, tasks);
    expect(waves).toHaveLength(2);
    expect(waves[0].tasks).toContain("T-01");
    expect(waves[1].tasks).toContain("T-02");
  });

  it("throws on invalid JSON", () => {
    expect(() => parseWaves("not json", [])).toThrow();
  });

  it("throws on missing waves array", () => {
    expect(() => parseWaves(JSON.stringify({}), [])).toThrow();
  });

  it("throws on cycle detected in dependencies", () => {
    const tasks = [makeTask("T-01", ["T-02"]), makeTask("T-02", ["T-01"])];
    const jsonBlock = JSON.stringify({
      waves: [{ wave: 1, tasks: ["T-01", "T-02"] }],
    });

    expect(() => parseWaves(jsonBlock, tasks)).toThrow(/cycle/i);
  });

  it("handles empty wave block", () => {
    const waves = parseWaves(JSON.stringify({ waves: [] }), []);
    expect(waves).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// computeDependencyClosure
// ---------------------------------------------------------------------------

describe("computeDependencyClosure", () => {
  it("returns single task with no deps", () => {
    const tasks = [makeTask("T-01"), makeTask("T-02")];
    const closure = computeDependencyClosure("T-01", tasks);
    expect(closure).toEqual(["T-01"]);
  });

  it("includes transitive dependencies", () => {
    const tasks = [makeTask("T-01"), makeTask("T-02", ["T-01"]), makeTask("T-03", ["T-02"])];
    const closure = computeDependencyClosure("T-03", tasks);
    expect(closure.sort()).toEqual(["T-01", "T-02", "T-03"]);
  });

  it("excludes non-dependency tasks", () => {
    const tasks = [makeTask("T-01"), makeTask("T-02"), makeTask("T-03", ["T-01"])];
    const closure = computeDependencyClosure("T-03", tasks);
    expect(closure).not.toContain("T-02");
  });

  it("throws on unknown task id", () => {
    const tasks = [makeTask("T-01")];
    expect(() => computeDependencyClosure("T-99", tasks)).toThrow();
  });

  // PBT: closure never contains non-dependency tasks
  it("closure only contains task and its transitive deps", () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat({ max: 20 }), { minLength: 1, maxLength: 10 }).map((nums) => {
          const unique = [...new Set(nums)];
          return unique.map((n, i) =>
            makeTask(
              `T-${String(n).padStart(2, "0")}`,
              i > 0 ? [`T-${String(unique[i - 1]).padStart(2, "0")}`] : undefined,
            ),
          );
        }),
        (tasks) => {
          const targetId = tasks[tasks.length - 1].id;
          const closure = computeDependencyClosure(targetId, tasks);
          for (const id of closure) {
            expect(tasks.some((t) => t.id === id)).toBe(true);
          }
          expect(closure).toContain(targetId);
        },
      ),
    );
  });
});
