/**
 * Integration tests for glossary-miss detection in `src/spec.ts`.
 *
 * Covers the forge-spec → glossary integration described in Requirement 1.4:
 * a locked / draft Spec's body text is scanned for candidate terms, and any
 * term that is not present in the glossary is reported via a
 * `[glossary-miss] 未定义术语：[...]` notice.
 *
 * **Validates: Requirements 1.4**
 */

import { describe, expect, it } from "vitest";
import {
  detectGlossaryMiss,
  renderGlossaryMissNotice,
  type SpecDocument,
  specTextFromDocument,
} from "../src/spec.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/**
 * Build a SpecDocument whose body mentions several TitleCase and Chinese
 * domain terms, each repeated enough times to clear the default
 * `minFrequency` threshold of 2.
 */
function buildSpecWithTerms(): SpecDocument {
  return {
    frontmatter: {
      feature: "sample-feature",
      status: "draft",
      date: "2026-05-05",
    },
    purpose:
      "引入 Materialization Cascade 机制，解决 Vertical Slice 难以独立交付的问题。Materialization Cascade 与 Vertical Slice 协同工作。",
    requirements: [
      {
        title: "术语一致性",
        description:
          "Dynamic Dispatch 的语义需对齐，Dynamic Dispatch 与 Event Sourcing 必须在 spec 与 plan 之间一致。Event Sourcing 要求持久化事件。",
        scenarios: [
          "当引入新术语时，则扫描 Dynamic Dispatch 与 Event Sourcing 的使用位置",
          "当术语冲突时，则由 Materialization Cascade 拒绝合并",
        ],
      },
      {
        title: "边界控制",
        description: "单元测试 覆盖每条 Vertical Slice，单元测试 与 Vertical Slice 一一对应。",
        scenarios: ["当 Vertical Slice 完成时，则触发 单元测试 验证"],
      },
    ],
    exclusions: ["不做 Event Sourcing 的图形化展示", "不做 Dynamic Dispatch 的运行时调优"],
    isBrownfield: false,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("detectGlossaryMiss", () => {
  it("flags TitleCase and Chinese terms that are not defined in the glossary", () => {
    const spec = buildSpecWithTerms();
    const specText = specTextFromDocument(spec);

    // glossary does NOT yet contain any of the spec's domain terms
    const glossaryTerms = ["Tier", "Spec", "Plan"];

    const missed = detectGlossaryMiss(specText, glossaryTerms);
    const missedNames = missed.map((m) => m.term);

    expect(missedNames).toContain("Materialization Cascade");
    expect(missedNames).toContain("Vertical Slice");
    expect(missedNames).toContain("Dynamic Dispatch");
    expect(missedNames).toContain("Event Sourcing");
    expect(missedNames).toContain("单元测试");
  });

  it("returns an empty list when every surfaced term is already defined in the glossary (including aliases)", () => {
    const spec = buildSpecWithTerms();
    const specText = specTextFromDocument(spec);

    // All candidate terms (and their casings) are considered defined.
    const glossaryTerms = [
      "Materialization Cascade",
      "Vertical Slice",
      "Dynamic Dispatch",
      "Event Sourcing",
      "单元测试",
    ];

    const missed = detectGlossaryMiss(specText, glossaryTerms);

    expect(missed).toEqual([]);
  });

  it("is pure — the same spec text and glossary produce identical results across calls", () => {
    const spec = buildSpecWithTerms();
    const specText = specTextFromDocument(spec);
    const glossaryTerms = ["Tier"];

    const first = detectGlossaryMiss(specText, glossaryTerms);
    const second = detectGlossaryMiss(specText, glossaryTerms);

    expect(second).toEqual(first);
  });
});

describe("renderGlossaryMissNotice", () => {
  it("renders the [glossary-miss] line with terms joined by ', '", () => {
    const spec = buildSpecWithTerms();
    const specText = specTextFromDocument(spec);
    const missed = detectGlossaryMiss(specText, ["Tier", "Spec"]);

    const notice = renderGlossaryMissNotice(missed);

    expect(notice.startsWith("[glossary-miss] 未定义术语：[")).toBe(true);
    expect(notice.endsWith("]")).toBe(true);
    // Each reported term should appear verbatim inside the bracketed list.
    for (const candidate of missed) {
      expect(notice).toContain(candidate.term);
    }
    // Terms must be separated by a comma followed by a single space.
    const inside = notice.slice("[glossary-miss] 未定义术语：[".length, notice.length - 1);
    expect(inside.split(", ")).toEqual(missed.map((m) => m.term));
  });

  it("returns an empty string when nothing is missing", () => {
    const notice = renderGlossaryMissNotice([]);
    expect(notice).toBe("");
  });

  it("end-to-end: glossary already contains every term ⇒ notice is empty", () => {
    const spec = buildSpecWithTerms();
    const specText = specTextFromDocument(spec);
    const glossaryTerms = [
      "Materialization Cascade",
      "Vertical Slice",
      "Dynamic Dispatch",
      "Event Sourcing",
      "单元测试",
    ];

    const missed = detectGlossaryMiss(specText, glossaryTerms);
    const notice = renderGlossaryMissNotice(missed);

    expect(notice).toBe("");
  });
});

describe("specTextFromDocument", () => {
  it("includes purpose, requirement bodies, scenarios, exclusions, and delta entries", () => {
    const spec: SpecDocument = {
      frontmatter: {
        feature: "delta-feature",
        status: "draft",
        date: "2026-05-05",
      },
      purpose: "Purpose Line",
      requirements: [
        {
          title: "Req Title",
          description: "Req Description",
          scenarios: ["当 trigger 时，则 Observable Outcome"],
        },
      ],
      exclusions: ["Exclusion Item"],
      isBrownfield: true,
      delta: {
        added: ["Added Entry"],
        modified: ["Modified Entry"],
        unchanged: ["Unchanged Entry"],
      },
    };

    const text = specTextFromDocument(spec);

    for (const fragment of [
      "Purpose Line",
      "Req Title",
      "Req Description",
      "当 trigger 时，则 Observable Outcome",
      "Exclusion Item",
      "Added Entry",
      "Modified Entry",
      "Unchanged Entry",
    ]) {
      expect(text).toContain(fragment);
    }
  });

  it("omits empty strings without producing leading / trailing blank lines", () => {
    const spec: SpecDocument = {
      frontmatter: { feature: "f", status: "draft", date: "2026-05-05" },
      purpose: "",
      requirements: [{ title: "T", description: "", scenarios: ["", "当 x 时，则 y"] }],
      exclusions: ["", "E"],
      isBrownfield: false,
    };

    const text = specTextFromDocument(spec);

    expect(text.startsWith("\n")).toBe(false);
    expect(text.endsWith("\n")).toBe(false);
    expect(text).not.toContain("\n\n");
  });
});
