/**
 * Property-based and unit tests for the Evolution marker module.
 *
 * Covers:
 *   - Property: {@link parseEvolutionMarkers} never throws on arbitrary
 *     strings.
 *   - Property: {@link aggregateEvolutionMarkers} returns an empty
 *     report for an empty input map; output is deterministic under the
 *     same input.
 *   - Property: {@link validateEvolutionTarget} returns `orphan=true`
 *     for targets whose base skill is absent from the registry.
 *   - Unit: parseEvolutionMarkers extracts date / source / target /
 *     description / lineNumber from a well-formed marker.
 *   - Unit: aggregateEvolutionMarkers sets `suggestAdr=true` when 3+
 *     markers point at the same `skill#section`.
 *
 * **Validates: Requirements 8.1, 8.3, 8.4, 8.8, 8.13, 8.14**
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  aggregateEvolutionMarkers,
  type EvolutionMarker,
  parseEvolutionMarkers,
  validateEvolutionTarget,
} from "../src/evolution-marker.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Known skill names used in both source registry and generated targets. */
const SKILLS_REGISTRY = [
  "forge-build",
  "forge-review",
  "forge-ship",
  "forge-decide",
  "forge-learn",
];

/**
 * Scalar safe for embedding into a marker: no newlines, no pipe, no
 * `-->` closer, no embedded `<!--` opener. Strip anything that could
 * collide with the comment grammar so the generator cannot accidentally
 * produce a valid-looking marker inside a fuzz field.
 */
const innerScalarArb = fc
  .string({ minLength: 1, maxLength: 40 })
  .map((s) => s.replace(/[\n\r|]/g, ""))
  .map((s) => s.replace(/-->/g, ""))
  .map((s) => s.replace(/<!--/g, ""))
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const dateArb = fc
  .tuple(
    fc.integer({ min: 2020, max: 2099 }),
    fc.integer({ min: 1, max: 12 }),
    fc.integer({ min: 1, max: 28 }),
  )
  .map(([y, m, d]) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);

const skillArb = fc.constantFrom(...SKILLS_REGISTRY);

const targetArb = fc.oneof(
  skillArb,
  fc.tuple(skillArb, innerScalarArb).map(([s, sec]) => `${s}#${sec}`),
);

// ---------------------------------------------------------------------------
// Property: parseEvolutionMarkers is total
// ---------------------------------------------------------------------------

describe("evolution-marker — parseEvolutionMarkers", () => {
  it("never throws for any input string", () => {
    fc.assert(
      fc.property(fc.string(), (content) => {
        expect(() => parseEvolutionMarkers(content)).not.toThrow();
      }),
    );
  });

  it("returns an empty array when the document has no markers", () => {
    expect(parseEvolutionMarkers("just some text\n\n# heading\n\nbody")).toEqual([]);
  });

  it("extracts date / source / target / description / lineNumber", () => {
    const doc = [
      "# Review",
      "",
      "<!-- Evolution: 2026-05-05 | source: ep-2026-05-05-001 | target: forge-build#three_strike -->",
      "连续三次 TDD 失败指向任务拆分过粗",
      "需要补一个拆分指南",
    ].join("\n");

    const markers = parseEvolutionMarkers(doc, ".tinkerman/reviews/demo.md");
    expect(markers).toHaveLength(1);

    const [m] = markers;
    expect(m.date).toBe("2026-05-05");
    expect(m.source).toBe("ep-2026-05-05-001");
    expect(m.target).toBe("forge-build#three_strike");
    expect(m.description).toBe("连续三次 TDD 失败指向任务拆分过粗\n需要补一个拆分指南");
    expect(m.filePath).toBe(".tinkerman/reviews/demo.md");
    expect(m.lineNumber).toBe(3);
  });

  it("terminates a description at the next marker", () => {
    const doc = [
      "<!-- Evolution: 2026-05-01 | source: ep-2026-05-01-001 | target: forge-build -->",
      "first description",
      "<!-- Evolution: 2026-05-02 | source: ep-2026-05-02-001 | target: forge-review -->",
      "second description",
    ].join("\n");

    const markers = parseEvolutionMarkers(doc);
    expect(markers).toHaveLength(2);
    expect(markers[0].description).toBe("first description");
    expect(markers[1].description).toBe("second description");
  });

  it("ignores malformed comment lines without raising", () => {
    const doc = [
      "<!-- Evolution: missing fields -->",
      "<!-- Evolution: 2026-05-05 | source: s1 | target: forge-build -->",
      "ok",
    ].join("\n");

    const markers = parseEvolutionMarkers(doc);
    expect(markers).toHaveLength(1);
    expect(markers[0].source).toBe("s1");
  });

  it("defaults filePath to the empty string when not supplied", () => {
    const doc = [
      "<!-- Evolution: 2026-05-05 | source: ep-x | target: forge-build -->",
      "desc",
    ].join("\n");
    const [m] = parseEvolutionMarkers(doc);
    expect(m.filePath).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Property: validateEvolutionTarget orphan semantics
// ---------------------------------------------------------------------------

describe("evolution-marker — validateEvolutionTarget", () => {
  it("returns orphan=true for any target whose base name is not in the registry", () => {
    fc.assert(
      fc.property(
        innerScalarArb.filter((s) => !SKILLS_REGISTRY.includes(s) && !s.includes("#")),
        (unknownSkill) => {
          const result = validateEvolutionTarget(unknownSkill, SKILLS_REGISTRY);
          expect(result.valid).toBe(false);
          expect(result.orphan).toBe(true);
          expect(result.reason).toBeTypeOf("string");
        },
      ),
    );
  });

  it("returns valid=true for a known skill with or without section qualifier", () => {
    expect(validateEvolutionTarget("forge-build", SKILLS_REGISTRY)).toEqual({
      valid: true,
      orphan: false,
    });
    expect(validateEvolutionTarget("forge-build#three_strike", SKILLS_REGISTRY)).toEqual({
      valid: true,
      orphan: false,
    });
  });

  it("treats an empty target as orphan", () => {
    const result = validateEvolutionTarget("", SKILLS_REGISTRY);
    expect(result.orphan).toBe(true);
    expect(result.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Property: aggregateEvolutionMarkers determinism + empty input
// ---------------------------------------------------------------------------

describe("evolution-marker — aggregateEvolutionMarkers", () => {
  const fixedNow = new Date("2026-05-05T08:00:00.000Z");

  it("returns an empty report for an empty input map", () => {
    const report = aggregateEvolutionMarkers(new Map(), SKILLS_REGISTRY, fixedNow);
    expect(report.totalMarkers).toBe(0);
    expect(report.bySkill).toEqual([]);
    expect(report.orphans).toEqual([]);
    expect(report.generatedAt).toBe(fixedNow.toISOString());
  });

  it("is deterministic for the same input", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(dateArb, innerScalarArb, targetArb, innerScalarArb), {
          minLength: 0,
          maxLength: 12,
        }),
        (rows) => {
          const markersByFile = new Map<string, EvolutionMarker[]>();
          rows.forEach(([date, source, target, filePath], idx) => {
            const marker: EvolutionMarker = {
              date,
              source,
              target,
              description: "d",
              filePath: filePath || `file-${idx}`,
              lineNumber: idx + 1,
            };
            const list = markersByFile.get(marker.filePath) ?? [];
            list.push(marker);
            markersByFile.set(marker.filePath, list);
          });

          const a = aggregateEvolutionMarkers(markersByFile, SKILLS_REGISTRY, fixedNow);
          const b = aggregateEvolutionMarkers(markersByFile, SKILLS_REGISTRY, fixedNow);
          expect(a).toEqual(b);
        },
      ),
    );
  });

  it("groups by target skill and collects deduped sources", () => {
    const markers: EvolutionMarker[] = [
      {
        date: "2026-05-01",
        source: "ep-1",
        target: "forge-build#three_strike",
        description: "d1",
        filePath: "a.md",
        lineNumber: 1,
      },
      {
        date: "2026-05-02",
        source: "ep-1",
        target: "forge-build#three_strike",
        description: "d2",
        filePath: "a.md",
        lineNumber: 10,
      },
      {
        date: "2026-05-03",
        source: "ep-2",
        target: "forge-review",
        description: "d3",
        filePath: "b.md",
        lineNumber: 1,
      },
    ];
    const byFile = new Map<string, EvolutionMarker[]>([
      ["a.md", [markers[0], markers[1]]],
      ["b.md", [markers[2]]],
    ]);

    const report = aggregateEvolutionMarkers(byFile, SKILLS_REGISTRY, fixedNow);
    expect(report.totalMarkers).toBe(3);
    expect(report.bySkill.map((b) => b.targetSkill)).toEqual(["forge-build", "forge-review"]);

    const build = report.bySkill.find((b) => b.targetSkill === "forge-build");
    expect(build?.markerCount).toBe(2);
    expect(build?.sources).toEqual(["ep-1"]);
  });

  it("flags suggestAdr=true when 3+ markers share the same skill#section", () => {
    const make = (i: number): EvolutionMarker => ({
      date: `2026-05-0${i}`,
      source: `ep-${i}`,
      target: "forge-build#three_strike",
      description: `d${i}`,
      filePath: `file-${i}.md`,
      lineNumber: 1,
    });
    const byFile = new Map<string, EvolutionMarker[]>([
      ["file-1.md", [make(1)]],
      ["file-2.md", [make(2)]],
      ["file-3.md", [make(3)]],
    ]);

    const report = aggregateEvolutionMarkers(byFile, SKILLS_REGISTRY, fixedNow);
    expect(report.bySkill).toHaveLength(1);
    expect(report.bySkill[0].suggestAdr).toBe(true);
    expect(report.bySkill[0].sources).toEqual(["ep-1", "ep-2", "ep-3"]);
  });

  it("does not flag suggestAdr when the same skill is hit at different sections", () => {
    const markers: EvolutionMarker[] = [
      {
        date: "2026-05-01",
        source: "ep-1",
        target: "forge-build#three_strike",
        description: "d",
        filePath: "a.md",
        lineNumber: 1,
      },
      {
        date: "2026-05-02",
        source: "ep-2",
        target: "forge-build#other",
        description: "d",
        filePath: "b.md",
        lineNumber: 1,
      },
      {
        date: "2026-05-03",
        source: "ep-3",
        target: "forge-build",
        description: "d",
        filePath: "c.md",
        lineNumber: 1,
      },
    ];
    const byFile = new Map<string, EvolutionMarker[]>([
      ["a.md", [markers[0]]],
      ["b.md", [markers[1]]],
      ["c.md", [markers[2]]],
    ]);

    const report = aggregateEvolutionMarkers(byFile, SKILLS_REGISTRY, new Date(0));
    expect(report.bySkill[0].suggestAdr).toBe(false);
  });

  it("collects orphan markers whose target skill is unknown", () => {
    const orphan: EvolutionMarker = {
      date: "2026-05-05",
      source: "ep-orphan",
      target: "forge-nonexistent",
      description: "d",
      filePath: "x.md",
      lineNumber: 42,
    };
    const valid: EvolutionMarker = {
      date: "2026-05-05",
      source: "ep-valid",
      target: "forge-build",
      description: "d",
      filePath: "y.md",
      lineNumber: 1,
    };
    const byFile = new Map<string, EvolutionMarker[]>([
      ["x.md", [orphan]],
      ["y.md", [valid]],
    ]);

    const report = aggregateEvolutionMarkers(byFile, SKILLS_REGISTRY, new Date(0));
    expect(report.orphans).toEqual([orphan]);
    expect(report.bySkill).toHaveLength(1);
    expect(report.bySkill[0].targetSkill).toBe("forge-build");
  });
});
