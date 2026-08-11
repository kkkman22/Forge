/**
 * Integration tests for glossary writeback in `src/learn.ts`.
 *
 * Covers the forge-learn → glossary integration described in Requirement
 * 1.6: at the end of a learn session we scan the decisions / findings /
 * reviews / progress / sessions text for candidate terms that are not yet
 * defined in `.tinkerman/glossary.md`, promote the user-confirmed subset into
 * `GlossaryTerm` drafts, and append them via `mergeTerm(..., "append")`.
 *
 * **Validates: Requirements 1.6**
 */

import { describe, expect, it } from "vitest";
import {
  findTerm,
  type Glossary,
  type GlossaryTerm,
  mergeTerm,
  parseGlossary,
  renderGlossary,
} from "../src/glossary.js";
import {
  buildNewGlossaryTerm,
  extractSessionTermCandidates,
  type SessionData,
} from "../src/learn.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function buildEmptyGlossary(): Glossary {
  return { schema_version: 1, updated: "2026-05-05", terms: [] };
}

function buildSeededGlossary(): Glossary {
  return {
    schema_version: 1,
    updated: "2026-05-05",
    terms: [
      {
        term: "Tier",
        definition: "Forge 三维路由中的复杂度维度。",
        aliases: ["档位"],
        last_updated: "2026-05-05",
      },
      {
        term: "Spec",
        definition: "需求锁定的产物。",
        last_updated: "2026-05-05",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// extractSessionTermCandidates
// ---------------------------------------------------------------------------

describe("extractSessionTermCandidates", () => {
  it("surfaces TitleCase and Chinese terms present in session sources", () => {
    const session: SessionData = {
      decisions: [
        "引入 Materialization Cascade 以替代散文描述。Materialization Cascade 降低 token 成本。",
      ],
      findings: ["Vertical Slice 的边界需要重新定义。Vertical Slice 与 Tier 路由对齐。"],
      reviews: ["评审过程中发现 单元测试 覆盖不足，单元测试 的断言需要加强。"],
    };

    const candidates = extractSessionTermCandidates(session, buildEmptyGlossary());
    const names = candidates.map((c) => c.term);

    expect(names).toContain("Materialization Cascade");
    expect(names).toContain("Vertical Slice");
    expect(names).toContain("单元测试");
  });

  it("skips terms already present in the glossary (by canonical name)", () => {
    const glossary = buildSeededGlossary();
    const session: SessionData = {
      decisions: [
        "Tier 路由已稳定。Tier 的三档划分保持不变。Spec 文档结构不变，Spec 只需追加章节。",
      ],
      findings: ["新增 Closure First Probe 约束。Closure First Probe 在 build 阶段生效。"],
    };

    const candidates = extractSessionTermCandidates(session, glossary);
    const names = candidates.map((c) => c.term);

    expect(names).not.toContain("Tier");
    expect(names).not.toContain("Spec");
    expect(names).toContain("Closure First Probe");
  });

  it("skips terms matched by a glossary alias", () => {
    const glossary = buildSeededGlossary();
    // "档位" is an alias of Tier; mentioning it twice must not resurface it.
    const session: SessionData = {
      findings: ["我们在 档位 分发时收紧了回退策略。档位 的回退策略需要记录。"],
    };

    const candidates = extractSessionTermCandidates(session, glossary);
    const names = candidates.map((c) => c.term);

    expect(names).not.toContain("档位");
  });

  it("returns [] when every source is empty or undefined", () => {
    const emptySession: SessionData = {
      decisions: [],
      findings: [""],
      reviews: undefined,
    };

    expect(extractSessionTermCandidates(emptySession, buildEmptyGlossary())).toEqual([]);
    expect(extractSessionTermCandidates({}, buildEmptyGlossary())).toEqual([]);
  });

  it("concatenates all source buckets so cross-source frequency counts", () => {
    // Single mention per bucket — individually below minFrequency=2, but two
    // mentions across buckets should combine to clear the threshold.
    const session: SessionData = {
      decisions: ["Materialization Cascade 在 decide 阶段被提出。"],
      findings: ["Materialization Cascade 在 findings 中再次出现。"],
    };

    const candidates = extractSessionTermCandidates(session, buildEmptyGlossary());
    const names = candidates.map((c) => c.term);

    expect(names).toContain("Materialization Cascade");
  });

  it("is deterministic: same inputs produce the same output", () => {
    const session: SessionData = {
      decisions: ["Vertical Slice 的边界问题。Vertical Slice 在此上下文中重要。"],
      findings: ["Materialization Cascade 与 Vertical Slice 的关系。"],
    };

    const first = extractSessionTermCandidates(session, buildEmptyGlossary());
    const second = extractSessionTermCandidates(session, buildEmptyGlossary());

    expect(second).toEqual(first);
  });
});

// ---------------------------------------------------------------------------
// buildNewGlossaryTerm
// ---------------------------------------------------------------------------

describe("buildNewGlossaryTerm", () => {
  const fixedNow = new Date("2026-05-05T08:30:00Z");

  it("produces a GlossaryTerm with the candidate's surface form and the supplied date", () => {
    const term = buildNewGlossaryTerm(
      {
        term: "Materialization Cascade",
        context: "引入 Materialization Cascade 以替代散文描述，降低 token 成本。",
        frequency: 3,
      },
      fixedNow,
    );

    expect(term.term).toBe("Materialization Cascade");
    expect(term.last_updated).toBe("2026-05-05");
    expect(term.definition.length).toBeGreaterThan(0);
    expect(term.definition.length).toBeLessThanOrEqual(200);
  });

  it("stores the session filename when provided", () => {
    const term = buildNewGlossaryTerm(
      { term: "Vertical Slice", context: "可独立交付的最小功能切片", frequency: 2 },
      fixedNow,
      "2026-05-05-glossary-writeback.md",
    );

    expect(term.source_session).toBe("2026-05-05-glossary-writeback.md");
  });

  it("omits source_session when the filename is absent or blank", () => {
    const a = buildNewGlossaryTerm(
      { term: "Vertical Slice", context: "context line", frequency: 2 },
      fixedNow,
    );
    const b = buildNewGlossaryTerm(
      { term: "Vertical Slice", context: "context line", frequency: 2 },
      fixedNow,
      "   ",
    );

    expect(a.source_session).toBeUndefined();
    expect(b.source_session).toBeUndefined();
  });

  it("caps the definition at 200 characters", () => {
    const longContext = "术语".repeat(500); // 1000 chars
    const term = buildNewGlossaryTerm(
      { term: "长术语", context: longContext, frequency: 2 },
      fixedNow,
    );

    expect(term.definition.length).toBeLessThanOrEqual(200);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: extract → build → mergeTerm("append")
// ---------------------------------------------------------------------------

describe("glossary writeback end-to-end", () => {
  const fixedNow = new Date("2026-05-05T08:30:00Z");

  it("session with new terms → glossary contains them after mergeTerm('append')", () => {
    const glossary = buildSeededGlossary();
    const session: SessionData = {
      decisions: [
        "引入 Materialization Cascade 以替代散文描述。Materialization Cascade 降低 token 成本。",
      ],
      findings: ["Vertical Slice 的边界需要重新定义。Vertical Slice 与 Tier 路由对齐。"],
    };

    const candidates = extractSessionTermCandidates(session, glossary);
    expect(candidates.length).toBeGreaterThan(0);

    // Simulate user confirmation for every candidate and promote.
    let updated = glossary;
    for (const candidate of candidates) {
      const term = buildNewGlossaryTerm(candidate, fixedNow, "2026-05-05-session.md");
      updated = mergeTerm(updated, term, "append");
    }

    // New terms now resolvable via findTerm
    expect(findTerm(updated, "Materialization Cascade")?.term).toBe("Materialization Cascade");
    expect(findTerm(updated, "Vertical Slice")?.term).toBe("Vertical Slice");

    // Original seeded terms are preserved
    expect(findTerm(updated, "Tier")?.term).toBe("Tier");
    expect(findTerm(updated, "Spec")?.term).toBe("Spec");

    // Round-trip through render/parse keeps the new entries intact
    const roundTripped = parseGlossary(renderGlossary(updated));
    expect(findTerm(roundTripped, "Materialization Cascade")?.term).toBe("Materialization Cascade");
    expect(findTerm(roundTripped, "Vertical Slice")?.term).toBe("Vertical Slice");

    // Every new term carries the ISO date we passed in
    const newTerm = findTerm(updated, "Materialization Cascade") as GlossaryTerm;
    expect(newTerm.last_updated).toBe("2026-05-05");
    expect(newTerm.source_session).toBe("2026-05-05-session.md");
  });

  it("second merge of the same candidates is a no-op (append is idempotent)", () => {
    const glossary = buildSeededGlossary();
    const session: SessionData = {
      decisions: ["Materialization Cascade 在 decide 阶段提出。Materialization Cascade 降本。"],
    };

    const candidates = extractSessionTermCandidates(session, glossary);
    let updated = glossary;
    for (const c of candidates) {
      updated = mergeTerm(updated, buildNewGlossaryTerm(c, fixedNow), "append");
    }
    const termCountAfterFirst = updated.terms.length;

    for (const c of candidates) {
      updated = mergeTerm(updated, buildNewGlossaryTerm(c, fixedNow), "append");
    }

    expect(updated.terms.length).toBe(termCountAfterFirst);
  });
});
