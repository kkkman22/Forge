/**
 * Integration tests for glossary-driven task name normalization in
 * `src/plan.ts`.
 *
 * Covers the forge-plan → glossary integration described in Requirement
 * 1.5: when the plan engine generates a task title, any alias or
 * alternative surface form that is defined in the glossary is rewritten
 * into its canonical `term`, keeping naming consistent across skills.
 *
 * **Validates: Requirements 1.5**
 */
import { describe, expect, it } from "vitest";
import { normalizeAtomicTask, normalizeLightweightTask, normalizeTaskTerms, } from "../src/plan.js";
// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
/**
 * A small glossary that mirrors the initial Forge preset: a Tier entry
 * with aliases "档位" and "复杂度档位", plus a Spec entry to cover the
 * case where a canonical term already appears verbatim in a title.
 */
function buildGlossary() {
    return {
        schema_version: 1,
        updated: "2026-05-05",
        terms: [
            {
                term: "Tier",
                definition: "Forge 三维路由中的复杂度维度。",
                aliases: ["档位", "复杂度档位"],
                last_updated: "2026-05-05",
            },
            {
                term: "Spec",
                definition: "需求锁定的产物。",
                last_updated: "2026-05-05",
            },
            {
                term: "Subagent",
                definition: "由主会话派发的专用子 agent。",
                aliases: ["子 agent", "sub-agent"],
                last_updated: "2026-05-05",
            },
        ],
    };
}
/** Full-format atomic task skeleton with a configurable title. */
function atomicTaskWithTitle(title) {
    return {
        taskNumber: 1,
        title,
        filePath: "src/foo.ts",
        estimatedMinutes: 3,
        tddSteps: {
            red: {
                testFile: "test/foo.test.ts",
                testCode: "it('x', () => {})",
                runCommand: "npx vitest run",
            },
            green: {
                sourceFile: "src/foo.ts",
                sourceCode: "export const x = 1;",
                runCommand: "npx vitest run",
            },
            refactor: "cleanup",
        },
        verifyCommand: "npx vitest run",
        commitMessage: "feat: add foo",
    };
}
/** Lightweight-format task skeleton with a configurable title. */
function lightweightTaskWithTitle(title) {
    return {
        taskNumber: 1,
        title,
        filePath: "src/foo.ts",
        goal: "add foo",
        designReference: "design.md#foo",
        verifyCommand: "npx vitest run",
        commitMessage: "feat: add foo",
    };
}
// ---------------------------------------------------------------------------
// normalizeTaskTerms
// ---------------------------------------------------------------------------
describe("normalizeTaskTerms", () => {
    const glossary = buildGlossary();
    it("replaces a single-word alias with the canonical term", () => {
        const out = normalizeTaskTerms("实现 档位 选择器", glossary);
        expect(out).toBe("实现 Tier 选择器");
    });
    it("replaces a multi-word (multi-character) alias with the canonical term", () => {
        const out = normalizeTaskTerms("重构 复杂度档位 分发逻辑", glossary);
        expect(out).toBe("重构 Tier 分发逻辑");
    });
    it("leaves a title that already uses the canonical term unchanged", () => {
        const title = "Add Tier detection to router";
        expect(normalizeTaskTerms(title, glossary)).toBe(title);
    });
    it("is case-insensitive: lowercase occurrences are rewritten to the canonical casing", () => {
        const out = normalizeTaskTerms("define tier fallback", glossary);
        expect(out).toBe("define Tier fallback");
    });
    it("returns the title unchanged when no glossary term appears in it", () => {
        const title = "优化构建缓存命中率";
        expect(normalizeTaskTerms(title, glossary)).toBe(title);
    });
    it("respects word boundaries for ASCII terms (no substring replacement)", () => {
        // "Spec" is canonical; "Specification" must NOT be rewritten.
        const title = "Update Specification document";
        expect(normalizeTaskTerms(title, glossary)).toBe(title);
    });
    it("respects word boundaries for CJK aliases (no partial-word replacement)", () => {
        // "档位" is an alias of Tier, but "档位选择器" is a larger CJK run and
        // must be left untouched.
        const title = "重构 档位选择器";
        expect(normalizeTaskTerms(title, glossary)).toBe(title);
    });
    it("prefers the longest matching surface form when multiple aliases overlap (greedy)", () => {
        // "档位" and "复杂度档位" both point at Tier. The longer form must
        // win so the title renders cleanly as "Tier 路由" rather than
        // consuming the prefix separately.
        const out = normalizeTaskTerms("设计 复杂度档位 路由", glossary);
        expect(out).toBe("设计 Tier 路由");
    });
    it("replaces multiple independent glossary hits in a single title", () => {
        const out = normalizeTaskTerms("让 档位 分发调用 sub-agent", glossary);
        expect(out).toBe("让 Tier 分发调用 Subagent");
    });
    it("is idempotent: normalizing twice yields the same result as once", () => {
        const title = "重构 复杂度档位 分发逻辑，调用 子 agent";
        const once = normalizeTaskTerms(title, glossary);
        const twice = normalizeTaskTerms(once, glossary);
        expect(twice).toBe(once);
    });
    it("is a no-op for an empty title", () => {
        expect(normalizeTaskTerms("", glossary)).toBe("");
    });
    it("is a no-op for an empty glossary", () => {
        const emptyGlossary = {
            schema_version: 1,
            updated: "2026-05-05",
            terms: [],
        };
        const title = "implement 档位 detection";
        expect(normalizeTaskTerms(title, emptyGlossary)).toBe(title);
    });
});
// ---------------------------------------------------------------------------
// normalizeLightweightTask / normalizeAtomicTask
// ---------------------------------------------------------------------------
describe("normalizeLightweightTask", () => {
    const glossary = buildGlossary();
    it("rewrites the title field using glossary canonical terms", () => {
        const task = lightweightTaskWithTitle("实现 档位 分发逻辑");
        const out = normalizeLightweightTask(task, glossary);
        expect(out.title).toBe("实现 Tier 分发逻辑");
    });
    it("leaves fields other than the title untouched", () => {
        const task = lightweightTaskWithTitle("实现 档位 分发逻辑");
        const out = normalizeLightweightTask(task, glossary);
        expect(out.taskNumber).toBe(task.taskNumber);
        expect(out.filePath).toBe(task.filePath);
        expect(out.goal).toBe(task.goal);
        expect(out.designReference).toBe(task.designReference);
        expect(out.verifyCommand).toBe(task.verifyCommand);
        expect(out.commitMessage).toBe(task.commitMessage);
    });
    it("returns the same reference when no normalization is needed (idempotent)", () => {
        const task = lightweightTaskWithTitle("Add Tier detection");
        const out = normalizeLightweightTask(task, glossary);
        expect(out).toBe(task);
    });
});
describe("normalizeAtomicTask", () => {
    const glossary = buildGlossary();
    it("rewrites the title field using glossary canonical terms", () => {
        const task = atomicTaskWithTitle("重构 复杂度档位 分发");
        const out = normalizeAtomicTask(task, glossary);
        expect(out.title).toBe("重构 Tier 分发");
    });
    it("leaves all non-title fields untouched", () => {
        const task = atomicTaskWithTitle("重构 复杂度档位 分发");
        const out = normalizeAtomicTask(task, glossary);
        expect(out.taskNumber).toBe(task.taskNumber);
        expect(out.filePath).toBe(task.filePath);
        expect(out.estimatedMinutes).toBe(task.estimatedMinutes);
        expect(out.tddSteps).toEqual(task.tddSteps);
        expect(out.verifyCommand).toBe(task.verifyCommand);
        expect(out.commitMessage).toBe(task.commitMessage);
    });
    it("returns the same reference when no normalization is needed", () => {
        const task = atomicTaskWithTitle("Add Tier detection");
        const out = normalizeAtomicTask(task, glossary);
        expect(out).toBe(task);
    });
});
// ---------------------------------------------------------------------------
// Cross-skill consistency
// ---------------------------------------------------------------------------
describe("glossary consistency across generated task titles", () => {
    const glossary = buildGlossary();
    it("every canonical term that appears in normalized titles matches its glossary definition", () => {
        const titles = [
            "实现 档位 分发逻辑",
            "重构 复杂度档位 路由",
            "让 sub-agent 参与 decide",
            "Update Specification document", // should remain untouched
        ];
        const normalized = titles.map((t) => normalizeTaskTerms(t, glossary));
        // Collect every canonical form that could appear in titles and check
        // each occurrence uses exactly the glossary-defined spelling.
        for (const entry of glossary.terms) {
            for (const title of normalized) {
                // If the title mentions the canonical form at all, it must do so
                // using the exact casing from the glossary.
                const lowered = title.toLowerCase();
                if (lowered.includes(entry.term.toLowerCase())) {
                    expect(title).toContain(entry.term);
                }
            }
        }
    });
});
//# sourceMappingURL=plan-glossary-normalization.test.js.map