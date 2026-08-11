/**
 * Unit and property-based tests for the zoom-out module (Phase 3.1).
 *
 * Covers:
 *   - Property: `renderZoomOut` is deterministic (same input → same output)
 *     and is stable under trailing whitespace on each section.
 *   - Property: `validateZoomOutOutput` flags exactly the sections that
 *     exceed the 5-non-empty-line budget.
 *   - Unit: `isZoomOutTrigger` recognises every documented trigger
 *     keyword (English + Chinese, with surrounding noise tolerated).
 *   - Unit: `pauseForZoomOut` / `resumeFromZoomOut` form a round-trip:
 *     `resumeFromZoomOut(pauseForZoomOut(s)) === s` when `s` has a
 *     concrete `phase` value and no existing `original_phase`.
 *   - Unit: `buildZoomOutPrompt` includes the required headings and
 *     the current-skill / topic context.
 *   - Unit: the full zoom-out workflow produces no writes to `.tinkerman/`
 *     other than the transient `phase` / `original_phase` fields —
 *     validated against an in-memory fs.
 *
 * **Validates: Requirements 6.3, 6.4, 6.5, 6.6, 6.8**
 */

import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  buildZoomOutPrompt,
  isZoomOutTrigger,
  MAX_LINES_PER_SECTION,
  pauseForZoomOut,
  renderZoomOut,
  resumeFromZoomOut,
  validateZoomOutOutput,
  ZOOM_OUT_PAUSED_PHASE,
  type ZoomOutOutput,
} from "../src/zoom-out.js";

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Arbitrary section body with a bounded non-empty line count. */
const sectionBodyArb = (maxEffectiveLines: number): fc.Arbitrary<string> =>
  fc
    .array(
      fc.string({ minLength: 1, maxLength: 30 }).map((s) => s.replace(/\n/g, " ")),
      {
        minLength: 0,
        maxLength: maxEffectiveLines,
      },
    )
    .map((lines) => lines.join("\n"));

const zoomOutOutputArb: fc.Arbitrary<ZoomOutOutput> = fc.record({
  overallLocation: sectionBodyArb(MAX_LINES_PER_SECTION),
  currentResponsibility: sectionBodyArb(MAX_LINES_PER_SECTION),
  boundaryWithNeighbors: sectionBodyArb(MAX_LINES_PER_SECTION),
});

// ---------------------------------------------------------------------------
// renderZoomOut — property
// ---------------------------------------------------------------------------

describe("renderZoomOut", () => {
  it("is deterministic (same input → same output)", () => {
    fc.assert(
      fc.property(zoomOutOutputArb, (output) => {
        expect(renderZoomOut(output)).toBe(renderZoomOut(output));
      }),
    );
  });

  it("includes the three required headings in fixed order", () => {
    const out: ZoomOutOutput = {
      overallLocation: "位于 src/ 下的核心模块",
      currentResponsibility: "负责 X 单一职责",
      boundaryWithNeighbors: "上游 Y，下游 Z",
    };
    const rendered = renderZoomOut(out);
    const posA = rendered.indexOf("## 整体位置");
    const posB = rendered.indexOf("## 当前职责");
    const posC = rendered.indexOf("## 与邻居的边界");
    expect(posA).toBeGreaterThanOrEqual(0);
    expect(posB).toBeGreaterThan(posA);
    expect(posC).toBeGreaterThan(posB);
  });

  it("is stable under trailing whitespace on each section", () => {
    const base: ZoomOutOutput = {
      overallLocation: "line A",
      currentResponsibility: "line B",
      boundaryWithNeighbors: "line C",
    };
    const padded: ZoomOutOutput = {
      overallLocation: "line A   \t  ",
      currentResponsibility: "line B  ",
      boundaryWithNeighbors: "line C      ",
    };
    expect(renderZoomOut(padded)).toBe(renderZoomOut(base));
  });
});

// ---------------------------------------------------------------------------
// validateZoomOutOutput — property
// ---------------------------------------------------------------------------

describe("validateZoomOutOutput", () => {
  it("returns valid=true when every section has ≤ 5 non-empty lines", () => {
    fc.assert(
      fc.property(zoomOutOutputArb, (output) => {
        const result = validateZoomOutOutput(output);
        expect(result.valid).toBe(true);
        expect(result.violations).toEqual([]);
      }),
    );
  });

  it("flags each section that exceeds the 5-line budget", () => {
    // Build a section with n non-empty lines.
    const makeBody = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}`).join("\n");

    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10 }),
        fc.integer({ min: 0, max: 10 }),
        fc.integer({ min: 0, max: 10 }),
        (a, b, c) => {
          const output: ZoomOutOutput = {
            overallLocation: makeBody(a),
            currentResponsibility: makeBody(b),
            boundaryWithNeighbors: makeBody(c),
          };
          const result = validateZoomOutOutput(output);
          const expectedOverflowCount =
            (a > MAX_LINES_PER_SECTION ? 1 : 0) +
            (b > MAX_LINES_PER_SECTION ? 1 : 0) +
            (c > MAX_LINES_PER_SECTION ? 1 : 0);
          expect(result.violations.length).toBe(expectedOverflowCount);
          expect(result.valid).toBe(expectedOverflowCount === 0);
        },
      ),
    );
  });

  it("blank / whitespace-only lines do not count toward the budget", () => {
    const output: ZoomOutOutput = {
      // 5 non-empty lines with blank separators — exactly at budget.
      overallLocation: "a\n\nb\n  \nc\n\nd\n\ne",
      currentResponsibility: "ok",
      boundaryWithNeighbors: "ok",
    };
    expect(validateZoomOutOutput(output).valid).toBe(true);
  });

  it("reports a violation with the Chinese section heading", () => {
    const bigBody = Array.from({ length: 6 }, (_, i) => `l${i}`).join("\n");
    const result = validateZoomOutOutput({
      overallLocation: bigBody,
      currentResponsibility: "ok",
      boundaryWithNeighbors: "ok",
    });
    expect(result.valid).toBe(false);
    expect(result.violations[0]).toContain("整体位置");
    expect(result.violations[0]).toContain("6");
  });
});

// ---------------------------------------------------------------------------
// isZoomOutTrigger — unit
// ---------------------------------------------------------------------------

describe("isZoomOutTrigger", () => {
  it.each([
    ["/tinkerman zoom-out"],
    ["/tinkerman zoom-out architecture"],
    ["zoom out"],
    ["Zoom Out please"],
    ["ZOOM OUT"],
    ["放大视角"],
    ["你能放大视角说一下吗"],
    ["讲整体"],
    ["帮我讲整体的结构"],
  ])("recognises trigger phrase: %s", (input) => {
    expect(isZoomOutTrigger(input)).toBe(true);
  });

  it.each([
    [""],
    ["zoom in"],
    ["/tinkerman status"],
    ["讲细节"],
    ["放大镜"],
    ["outzoom"],
  ])("does not fire on unrelated input: %s", (input) => {
    expect(isZoomOutTrigger(input)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildZoomOutPrompt — unit
// ---------------------------------------------------------------------------

describe("buildZoomOutPrompt", () => {
  it("includes the current skill, topic, and all three section headings", () => {
    const prompt = buildZoomOutPrompt({
      currentSkill: "forge-build",
      currentTopic: "add pagination",
      focusedFile: "src/api.ts",
    });
    expect(prompt).toContain("forge-build");
    expect(prompt).toContain("add pagination");
    expect(prompt).toContain("src/api.ts");
    expect(prompt).toContain("整体位置");
    expect(prompt).toContain("当前职责");
    expect(prompt).toContain("与邻居的边界");
    // No-write guarantee is stated explicitly in the prompt.
    expect(prompt.toLowerCase()).toContain("not write");
  });

  it("marks the focused file as unspecified when missing", () => {
    const prompt = buildZoomOutPrompt({
      currentSkill: "forge-spec",
      currentTopic: "auth flow",
    });
    expect(prompt).toContain("not specified");
  });

  it("is deterministic", () => {
    const input = { currentSkill: "forge-decide", currentTopic: "state store" };
    expect(buildZoomOutPrompt(input)).toBe(buildZoomOutPrompt(input));
  });
});

// ---------------------------------------------------------------------------
// pause / resume — round-trip
// ---------------------------------------------------------------------------

function makeStatus(phase: string, extra = ""): string {
  return [
    "---",
    "current_task: sample task",
    `phase: ${phase}`,
    "tier: full",
    "updated: 2026-05-05T10:00:00Z",
    extra,
    "---",
    "",
    "Body content stays verbatim.",
    "",
  ]
    .filter((l) => l !== "")
    .join("\n");
}

describe("pauseForZoomOut / resumeFromZoomOut", () => {
  it("round-trips a concrete phase through pause and resume", () => {
    const original = makeStatus("build");
    const paused = pauseForZoomOut(original);
    expect(paused).toContain(`phase: ${ZOOM_OUT_PAUSED_PHASE}`);
    expect(paused).toContain("original_phase: build");
    expect(paused).toContain("Body content stays verbatim.");

    const resumed = resumeFromZoomOut(paused);
    expect(resumed).toContain("phase: build");
    expect(resumed).not.toContain("original_phase:");
    expect(resumed).toContain("Body content stays verbatim.");
  });

  it("is a no-op when the status has no frontmatter", () => {
    const s = "no frontmatter here";
    expect(pauseForZoomOut(s)).toBe(s);
    expect(resumeFromZoomOut(s)).toBe(s);
  });

  it("is a no-op when no phase field is present", () => {
    const s = ["---", "current_task: x", "---", "", "body"].join("\n");
    expect(pauseForZoomOut(s)).toBe(s);
  });

  it("is idempotent when already paused", () => {
    const original = makeStatus("build");
    const once = pauseForZoomOut(original);
    const twice = pauseForZoomOut(once);
    expect(twice).toBe(once);
  });

  it("resume is a no-op when the status is not paused", () => {
    const s = makeStatus("build");
    expect(resumeFromZoomOut(s)).toBe(s);
  });

  it("preserves other frontmatter fields verbatim across round-trip", () => {
    const input = makeStatus("review");
    const out = resumeFromZoomOut(pauseForZoomOut(input));
    expect(out).toContain("current_task: sample task");
    expect(out).toContain("tier: full");
    expect(out).toContain("updated: 2026-05-05T10:00:00Z");
    expect(out).toContain("phase: review");
  });

  it("round-trips many concrete phases (property)", () => {
    fc.assert(
      fc.property(
        fc
          // Use an alphanumeric-plus-underscore alphabet to stay inside
          // the frontmatter's string extraction contract: no YAML
          // comment markers, no quote chars, no whitespace that would
          // be collapsed by the underlying parser.
          .stringMatching(/^[A-Za-z_][A-Za-z0-9_]{0,19}$/)
          .filter((s) => s !== ZOOM_OUT_PAUSED_PHASE),
        (phase) => {
          const input = makeStatus(phase);
          const resumed = resumeFromZoomOut(pauseForZoomOut(input));
          expect(resumed).toContain(`phase: ${phase}`);
          expect(resumed).not.toContain("original_phase:");
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// No-side-effect guarantee (in-memory fs)
// ---------------------------------------------------------------------------

describe("zoom-out workflow produces no writes outside status.md", () => {
  /**
   * Models the subset of `.tinkerman/` that a zoom-out invocation could
   * touch: status.md plus the four open / guarded directories the
   * requirement forbids writing to. We snapshot the contents before
   * the workflow, run the pure pipeline end-to-end (pause → prompt →
   * validate → render → resume), and verify only status.md changed.
   */
  function snapshot(fs: Map<string, string>): Map<string, string> {
    return new Map(fs);
  }

  it("only .tinkerman/status.md is mutated by pause / resume", () => {
    const fs = new Map<string, string>([
      [".tinkerman/status.md", makeStatus("build")],
      [".tinkerman/findings/note.md", "# prior findings\n"],
      [".tinkerman/decisions/ADR-0001.md", "# ADR 1\n"],
      [".tinkerman/knowledge/instincts.md", "# instincts\n"],
      [".tinkerman/progress/task.md", "# progress\n"],
    ]);
    const before = snapshot(fs);

    // --- pause
    const pausedStatus = pauseForZoomOut(fs.get(".tinkerman/status.md") ?? "");
    fs.set(".tinkerman/status.md", pausedStatus);

    // --- prompt & render cycle (all pure, no IO possible)
    const prompt = buildZoomOutPrompt({
      currentSkill: "forge-build",
      currentTopic: "sample task",
    });
    expect(prompt.length).toBeGreaterThan(0);

    const output: ZoomOutOutput = {
      overallLocation: "pos",
      currentResponsibility: "resp",
      boundaryWithNeighbors: "boundary",
    };
    expect(validateZoomOutOutput(output).valid).toBe(true);
    const rendered = renderZoomOut(output);
    expect(rendered).toContain("## 整体位置");

    // --- resume
    const resumedStatus = resumeFromZoomOut(fs.get(".tinkerman/status.md") ?? "");
    fs.set(".tinkerman/status.md", resumedStatus);

    // Every file other than status.md must be byte-identical.
    for (const [path, originalContent] of before) {
      if (path === ".tinkerman/status.md") continue;
      expect(fs.get(path)).toBe(originalContent);
    }

    // status.md, after full round-trip, returns to the pre-pause value.
    expect(fs.get(".tinkerman/status.md")).toBe(before.get(".tinkerman/status.md"));
  });
});
