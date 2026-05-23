/**
 * T-25: Unchanged → PBT derivation.
 *
 * Validates: Requirement 15, Property 11
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { derivePbtTasksFromUnchanged, computeFailSignature, triggerThreeStrikeReroute } from "../src/spec-pbt-derivation.js";
import type { BugfixDocument, EarsClause, SpecBundle, SpecFileFrontmatter, TasksSeedDocument } from "../src/spec-bundle.js";
import type { FixFailure } from "../src/spec-pbt-derivation.js";

function makeEars(when: string, shall: string, suffix = ""): EarsClause {
  return {
    line: 1,
    when,
    shall,
    raw: `当 ${when} 时 系统应当 ${shall}${suffix}`,
    ...(suffix === "[manual]" ? {} : {}),
  };
}

function makeBugfixBundle(unchanged: EarsClause[]): SpecBundle {
  const fm: SpecFileFrontmatter = {
    feature: "test-bugfix",
    status: "locked",
    date: "2026-05-23",
    workflow_variant: "requirements-first",
  };
  const doc: BugfixDocument = {
    frontmatter: { ...fm, kind: "bugfix" },
    current: [makeEars("旧条件", "旧行为")],
    expected: [makeEars("新条件", "新行为")],
    unchanged,
  };
  const tasks: TasksSeedDocument = {
    frontmatter: { ...fm, kind: "bugfix" },
    tasks: [
      { id: "BFX-01", title: "Fix root cause", goal: "Fix it", related_requirements: [], status: "pending" },
    ],
  };
  return {
    feature: "test-bugfix",
    kind: "bugfix",
    layout: "three-file",
    variant: "requirements-first",
    primary: doc,
    tasks,
  };
}

// ---------------------------------------------------------------------------
// derivePbtTasksFromUnchanged
// ---------------------------------------------------------------------------

describe("derivePbtTasksFromUnchanged", () => {
  it("derives regression-test tasks from unchanged clauses", () => {
    const unchanged = [
      makeEars("登录", "返回 200"),
      makeEars("登出", "清除 session"),
      makeEars("注册", "创建账户"),
      makeEars("查询", "返回结果"),
      makeEars("删除", "返回 204", "[manual]"),
    ];
    const bundle = makeBugfixBundle(unchanged);

    const tasks = derivePbtTasksFromUnchanged(bundle);
    expect(tasks).toHaveLength(5);
    expect(tasks.filter((t) => t.verification === "pbt")).toHaveLength(4);
    expect(tasks.filter((t) => t.verification === "manual")).toHaveLength(1);
  });

  it("each task has source_clause pointing to one unchanged clause", () => {
    const unchanged = [
      makeEars("A", "do A"),
      makeEars("B", "do B"),
      makeEars("C", "do C"),
    ];
    const bundle = makeBugfixBundle(unchanged);

    const tasks = derivePbtTasksFromUnchanged(bundle);
    for (const task of tasks) {
      expect(task.source_clause).toBeDefined();
      const matched = unchanged.find((u) => u.raw === task.source_clause);
      expect(matched).toBeDefined();
    }
  });

  it("each task depends on last fix-implementation task", () => {
    const unchanged = [makeEars("X", "do X")];
    const bundle = makeBugfixBundle(unchanged);

    const tasks = derivePbtTasksFromUnchanged(bundle);
    for (const task of tasks) {
      expect(task.depends_on).toContain("BFX-01");
    }
  });

  it("all derived tasks have category regression-test", () => {
    const unchanged = [
      makeEars("A", "do A"),
      makeEars("B", "do B"),
    ];
    const bundle = makeBugfixBundle(unchanged);

    const tasks = derivePbtTasksFromUnchanged(bundle);
    for (const task of tasks) {
      expect(task.category).toBe("regression-test");
    }
  });

  it("returns empty array for non-bugfix bundle", () => {
    const bundle: SpecBundle = {
      feature: "test",
      kind: "feature",
      layout: "three-file",
      variant: "requirements-first",
      primary: {
        frontmatter: { feature: "test", status: "locked", date: "2026-05-23", workflow_variant: "requirements-first" },
        intro: "",
        glossary: [],
        userStories: [],
        earsCriteria: [],
        nonFunctional: [],
        outOfScope: [],
      },
    };

    const tasks = derivePbtTasksFromUnchanged(bundle);
    expect(tasks).toHaveLength(0);
  });

  // PBT: Property 11 — every unchanged clause maps to exactly one task
  it("PBT: one task per unchanged clause (Property 11)", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            when: fc.string({ minLength: 1, maxLength: 20 }),
            shall: fc.string({ minLength: 1, maxLength: 20 }),
            manual: fc.boolean(),
          }),
          { minLength: 1, maxLength: 15 },
        ),
        (entries) => {
          const unchanged = entries.map((e, i) =>
            makeEars(e.when, e.shall, e.manual ? "[manual]" : ""),
          );
          // Deduplicate by raw text
          const seen = new Set<string>();
          const deduped: EarsClause[] = [];
          for (const u of unchanged) {
            if (!seen.has(u.raw)) {
              seen.add(u.raw);
              deduped.push(u);
            }
          }

          const bundle = makeBugfixBundle(deduped);
          const tasks = derivePbtTasksFromUnchanged(bundle);

          // One task per unchanged clause
          expect(tasks).toHaveLength(deduped.length);

          // All source_clauses are unique
          const sources = tasks.map((t) => t.source_clause);
          expect(new Set(sources).size).toBe(sources.length);

          // Each source_clause matches exactly one unchanged raw
          for (const task of tasks) {
            expect(deduped.some((u) => u.raw === task.source_clause)).toBe(true);
          }

          // manual verification matches
          for (const task of tasks) {
            const clause = deduped.find((u) => u.raw === task.source_clause)!;
            if (clause.raw.endsWith("[manual]")) {
              expect(task.verification).toBe("manual");
            } else {
              expect(task.verification).toBe("pbt");
            }
          }
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// §2.4 Three-strike reroute
// ---------------------------------------------------------------------------

describe("triggerThreeStrikeReroute", () => {
  it("does not reroute before 3 same-signature failures", () => {
    const failure: FixFailure = { testName: "test-a", firstLine: "Expected 1" };
    const result = triggerThreeStrikeReroute([], failure);
    expect(result.reroute).toBe(false);
    expect(result.failures).toHaveLength(1);
  });

  it("triggers reroute after 3 same-signature failures", () => {
    const failure: FixFailure = { testName: "test-a", firstLine: "Expected 1" };
    const history: FixFailure[] = [
      { testName: "test-a", firstLine: "Expected 1" },
      { testName: "test-a", firstLine: "Expected 1" },
    ];
    const result = triggerThreeStrikeReroute(history, failure);
    expect(result.reroute).toBe(true);
  });

  it("computes deterministic fail_signature", () => {
    const f1: FixFailure = { testName: "test-a", firstLine: "line 1" };
    const f2: FixFailure = { testName: "test-a", firstLine: "line 1" };
    expect(computeFailSignature([f1])).toBe(computeFailSignature([f2]));
  });

  it("different failures produce different signatures", () => {
    const f1: FixFailure = { testName: "test-a", firstLine: "line 1" };
    const f2: FixFailure = { testName: "test-b", firstLine: "line 2" };
    expect(computeFailSignature([f1])).not.toBe(computeFailSignature([f2]));
  });
});
