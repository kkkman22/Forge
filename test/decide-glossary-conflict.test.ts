/**
 * Integration tests for the glossary alignment check in `src/decide.ts`.
 *
 * Covers the forge-decide → glossary integration described in Requirement
 * 1.7: before Round 1 perspective output, the decide skill inspects the
 * user's candidate terms against `.tinkerman/glossary.md`. Any conflict
 * (same term / different definition, or a candidate alias colliding with
 * another term's name) must be surfaced as a clarification prompt that
 * the user resolves before Round 1 proceeds.
 *
 * **Validates: Requirements 1.7**
 */

import { describe, expect, it } from "vitest";
import {
  checkDecideGlossaryConflicts,
  type DecideGlossaryConflict,
  renderDecideGlossaryConflictPrompt,
} from "../src/decide.js";
import type { Glossary, GlossaryTerm } from "../src/glossary.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

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
// checkDecideGlossaryConflicts
// ---------------------------------------------------------------------------

describe("checkDecideGlossaryConflicts", () => {
  it("returns [] when a candidate introduces a brand-new term with no collisions", () => {
    const glossary = buildSeededGlossary();
    const candidate: GlossaryTerm = {
      term: "Vertical Slice",
      definition: "可独立交付的最小功能切片。",
      last_updated: "2026-05-05",
    };

    const conflicts = checkDecideGlossaryConflicts([candidate], glossary);
    expect(conflicts).toEqual([]);
  });

  it("returns [] when the candidate list is empty", () => {
    const glossary = buildSeededGlossary();
    expect(checkDecideGlossaryConflicts([], glossary)).toEqual([]);
  });

  it("flags a same-name / different-definition candidate with reason same_term_different_definition", () => {
    const glossary = buildSeededGlossary();
    const candidate: GlossaryTerm = {
      term: "Tier",
      definition: "用户订阅级别，付费等级。", // different meaning than the seeded "Tier"
      last_updated: "2026-05-05",
    };

    const conflicts = checkDecideGlossaryConflicts([candidate], glossary);

    expect(conflicts).toHaveLength(1);
    const [first] = conflicts;
    expect(first.term).toBe("Tier");
    expect(first.reason).toBe("same_term_different_definition");
    expect(first.candidate).toBe(candidate);
    expect(first.existing.term).toBe("Tier");
    expect(first.existing.definition).toBe("Forge 三维路由中的复杂度维度。");
  });

  it("flags a candidate whose alias collides with an existing term's name with reason same_alias_different_term", () => {
    const glossary = buildSeededGlossary();
    // "Spec" already exists as a term. A different candidate declaring
    // "Spec" as an alias must be reported as an alias collision.
    const candidate: GlossaryTerm = {
      term: "Specification Document",
      definition: "锁定需求的文档，长版。",
      aliases: ["Spec"],
      last_updated: "2026-05-05",
    };

    const conflicts = checkDecideGlossaryConflicts([candidate], glossary);

    expect(conflicts).toHaveLength(1);
    const [first] = conflicts;
    expect(first.term).toBe("Specification Document");
    expect(first.reason).toBe("same_alias_different_term");
    expect(first.existing.term).toBe("Spec");
    expect(first.candidate).toBe(candidate);
  });

  it("collects multiple conflicts in input order across several candidates", () => {
    const glossary = buildSeededGlossary();
    const candidates: GlossaryTerm[] = [
      // New term, no conflict → must be skipped from the result list.
      {
        term: "Vertical Slice",
        definition: "可独立交付的最小功能切片。",
        last_updated: "2026-05-05",
      },
      // Same-name / different-definition conflict.
      {
        term: "Spec",
        definition: "未锁定的草稿文档。",
        last_updated: "2026-05-05",
      },
      // Alias collision with existing "Tier".
      {
        term: "Level",
        definition: "任务复杂度层级的别称。",
        aliases: ["Tier"],
        last_updated: "2026-05-05",
      },
    ];

    const conflicts = checkDecideGlossaryConflicts(candidates, glossary);

    expect(conflicts).toHaveLength(2);
    expect(conflicts[0].term).toBe("Spec");
    expect(conflicts[0].reason).toBe("same_term_different_definition");
    expect(conflicts[1].term).toBe("Level");
    expect(conflicts[1].reason).toBe("same_alias_different_term");
  });

  it("does not mutate its inputs", () => {
    const glossary = buildSeededGlossary();
    const candidate: GlossaryTerm = {
      term: "Tier",
      definition: "用户订阅级别。",
      last_updated: "2026-05-05",
    };
    const glossarySnapshot = JSON.stringify(glossary);
    const candidateSnapshot = JSON.stringify(candidate);

    checkDecideGlossaryConflicts([candidate], glossary);

    expect(JSON.stringify(glossary)).toBe(glossarySnapshot);
    expect(JSON.stringify(candidate)).toBe(candidateSnapshot);
  });
});

// ---------------------------------------------------------------------------
// renderDecideGlossaryConflictPrompt
// ---------------------------------------------------------------------------

describe("renderDecideGlossaryConflictPrompt", () => {
  it("returns an empty string when there are no conflicts", () => {
    expect(renderDecideGlossaryConflictPrompt([])).toBe("");
  });

  it("renders the clarification prompt for a single conflict", () => {
    const existing: GlossaryTerm = {
      term: "Tier",
      definition: "Forge 三维路由中的复杂度维度。",
      last_updated: "2026-05-05",
    };
    const candidate: GlossaryTerm = {
      term: "Tier",
      definition: "用户订阅级别。",
      last_updated: "2026-05-05",
    };
    const conflicts: DecideGlossaryConflict[] = [
      {
        term: "Tier",
        existing,
        candidate,
        reason: "same_term_different_definition",
      },
    ];

    const rendered = renderDecideGlossaryConflictPrompt(conflicts);

    expect(rendered).toBe(
      [
        "⚠️ Glossary conflict detected (1):",
        `  - "Tier": existing = "${existing.definition}", proposed = "${candidate.definition}"`,
        "请澄清：保留现有 / 替换现有 / 新增别名",
      ].join("\n"),
    );
  });

  it("renders every conflict, preserves order, and includes the count", () => {
    const first: DecideGlossaryConflict = {
      term: "Spec",
      existing: {
        term: "Spec",
        definition: "需求锁定的产物。",
        last_updated: "2026-05-05",
      },
      candidate: {
        term: "Spec",
        definition: "未锁定的草稿文档。",
        last_updated: "2026-05-05",
      },
      reason: "same_term_different_definition",
    };
    const second: DecideGlossaryConflict = {
      term: "Level",
      existing: {
        term: "Tier",
        definition: "Forge 三维路由中的复杂度维度。",
        aliases: ["档位"],
        last_updated: "2026-05-05",
      },
      candidate: {
        term: "Level",
        definition: "任务复杂度层级的别称。",
        aliases: ["Tier"],
        last_updated: "2026-05-05",
      },
      reason: "same_alias_different_term",
    };

    const rendered = renderDecideGlossaryConflictPrompt([first, second]);
    const lines = rendered.split("\n");

    expect(lines[0]).toBe("⚠️ Glossary conflict detected (2):");
    expect(lines[1]).toBe(
      `  - "Spec": existing = "${first.existing.definition}", proposed = "${first.candidate.definition}"`,
    );
    expect(lines[2]).toBe(
      `  - "Level": existing = "${second.existing.definition}", proposed = "${second.candidate.definition}"`,
    );
    expect(lines[3]).toBe("请澄清：保留现有 / 替换现有 / 新增别名");
    expect(lines).toHaveLength(4);
  });
});
