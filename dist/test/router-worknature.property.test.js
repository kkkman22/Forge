/**
 * Property tests for the WorkNature routing dimension.
 *
 * Tests:
 *   - detectWorkNature returns correct values for various descriptions
 *   - Default is "feature" for ambiguous descriptions
 *   - WorkNature × Tier mapping produces correct sequence keys
 *
 * **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.9, 11.10, 12.5, 12.7, 12.8**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { classifyTask, detectWorkNature, getWorkNatureSequenceKey, } from "../src/router.js";
import { getRouterSequence } from "../src/workflow-graph.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
const taskSignalsArb = fc.record({
    filesAffected: fc.integer({ min: 0, max: 100 }),
    linesChanged: fc.integer({ min: 0, max: 5000 }),
    hasExistingSpec: fc.boolean(),
    hasNewService: fc.boolean(),
    hasNewDatabase: fc.boolean(),
    hasAuthChanges: fc.boolean(),
    isVagueRequirement: fc.boolean(),
    hasClearRequirements: fc.boolean(),
});
const tierArb = fc.constantFrom("light", "standard", "full");
const workNatureArb = fc.constantFrom("feature", "refactor", "bugfix");
/** Generates a description string that contains at least one refactor keyword. */
const refactorDescArb = fc
    .constantFrom("优化", "重构", "重写", "拆分", "性能改进", "代码整理", "refactor", "optimize", "restructure", "simplify")
    .chain((keyword) => fc.string({ minLength: 0, maxLength: 20 }).map((prefix) => `${prefix} ${keyword} ${prefix}`));
/** Generates a description string that contains at least one bugfix keyword. */
const bugfixDescArb = fc
    .constantFrom("bug", "报错", "异常", "崩溃", "不工作", "修复", "fix", "error", "crash", "broken", "not working")
    .chain((keyword) => fc.string({ minLength: 0, maxLength: 20 }).map((prefix) => `${prefix} ${keyword} ${prefix}`));
/** Generates a description string that contains NO refactor or bugfix keywords. */
const neutralDescArb = fc
    .string({ minLength: 1, maxLength: 50 })
    .filter((s) => {
    const lower = s.toLowerCase();
    const refactorKws = [
        "优化",
        "重构",
        "重写",
        "拆分",
        "性能改进",
        "代码整理",
        "refactor",
        "optimize",
        "restructure",
        "simplify",
    ];
    const bugfixKws = [
        "bug",
        "报错",
        "异常",
        "崩溃",
        "不工作",
        "修复",
        "fix",
        "error",
        "crash",
        "broken",
        "not working",
    ];
    return (!refactorKws.some((kw) => lower.includes(kw.toLowerCase())) &&
        !bugfixKws.some((kw) => lower.includes(kw.toLowerCase())));
});
// ---------------------------------------------------------------------------
// Property 33: detectWorkNature returns correct values
// **Validates: Requirements 11.1, 11.2, 11.3**
// ---------------------------------------------------------------------------
describe("Property 33: detectWorkNature keyword detection", () => {
    it("returns 'refactor' for descriptions with refactor keywords (no bugfix keywords)", () => {
        fc.assert(fc.property(refactorDescArb, (desc) => {
            // Filter out descriptions that also contain bugfix keywords
            const lower = desc.toLowerCase();
            const bugfixKws = [
                "bug",
                "报错",
                "异常",
                "崩溃",
                "不工作",
                "修复",
                "fix",
                "error",
                "crash",
                "broken",
                "not working",
            ];
            if (bugfixKws.some((kw) => lower.includes(kw.toLowerCase())))
                return; // skip ambiguous
            expect(detectWorkNature(desc)).toBe("refactor");
        }), { numRuns: 50 });
    });
    it("returns 'bugfix' for descriptions with bugfix keywords (no refactor keywords)", () => {
        fc.assert(fc.property(bugfixDescArb, (desc) => {
            // Filter out descriptions that also contain refactor keywords
            const lower = desc.toLowerCase();
            const refactorKws = [
                "优化",
                "重构",
                "重写",
                "拆分",
                "性能改进",
                "代码整理",
                "refactor",
                "optimize",
                "restructure",
                "simplify",
            ];
            if (refactorKws.some((kw) => lower.includes(kw.toLowerCase())))
                return; // skip ambiguous
            expect(detectWorkNature(desc)).toBe("bugfix");
        }), { numRuns: 50 });
    });
    it("returns 'feature' for descriptions with no matching keywords", () => {
        fc.assert(fc.property(neutralDescArb, (desc) => {
            expect(detectWorkNature(desc)).toBe("feature");
        }), { numRuns: 50 });
    });
    it("returns 'feature' when both refactor and bugfix keywords are present (ambiguous)", () => {
        fc.assert(fc.property(refactorDescArb, bugfixDescArb, (refactorDesc, bugfixDesc) => {
            const combined = `${refactorDesc} ${bugfixDesc}`;
            // Only test when both keyword types are actually present
            const lower = combined.toLowerCase();
            const refactorKws = [
                "优化",
                "重构",
                "重写",
                "拆分",
                "性能改进",
                "代码整理",
                "refactor",
                "optimize",
                "restructure",
                "simplify",
            ];
            const bugfixKws = [
                "bug",
                "报错",
                "异常",
                "崩溃",
                "不工作",
                "修复",
                "fix",
                "error",
                "crash",
                "broken",
                "not working",
            ];
            const hasRefactor = refactorKws.some((kw) => lower.includes(kw.toLowerCase()));
            const hasBugfix = bugfixKws.some((kw) => lower.includes(kw.toLowerCase()));
            if (hasRefactor && hasBugfix) {
                expect(detectWorkNature(combined)).toBe("feature");
            }
        }), { numRuns: 50 });
    });
});
// ---------------------------------------------------------------------------
// Property 33b: detectWorkNature specific examples
// **Validates: Requirements 11.3**
// ---------------------------------------------------------------------------
describe("detectWorkNature specific examples", () => {
    it("detects refactor for Chinese keywords", () => {
        expect(detectWorkNature("优化排序逻辑")).toBe("refactor");
        expect(detectWorkNature("重构用户模块")).toBe("refactor");
        expect(detectWorkNature("拆分大文件")).toBe("refactor");
        expect(detectWorkNature("性能改进")).toBe("refactor");
        expect(detectWorkNature("代码整理")).toBe("refactor");
    });
    it("detects refactor for English keywords", () => {
        expect(detectWorkNature("refactor the auth module")).toBe("refactor");
        expect(detectWorkNature("optimize database queries")).toBe("refactor");
        expect(detectWorkNature("restructure the project layout")).toBe("refactor");
        expect(detectWorkNature("simplify the routing logic")).toBe("refactor");
    });
    it("detects bugfix for Chinese keywords", () => {
        expect(detectWorkNature("登录页面报错")).toBe("bugfix");
        expect(detectWorkNature("用户列表异常")).toBe("bugfix");
        expect(detectWorkNature("应用崩溃了")).toBe("bugfix");
        expect(detectWorkNature("搜索功能不工作")).toBe("bugfix");
        expect(detectWorkNature("修复排序问题")).toBe("bugfix");
    });
    it("detects bugfix for English keywords", () => {
        expect(detectWorkNature("fix the login bug")).toBe("bugfix");
        expect(detectWorkNature("there is an error in the API")).toBe("bugfix");
        expect(detectWorkNature("the app crashes on startup")).toBe("bugfix");
        expect(detectWorkNature("search is broken")).toBe("bugfix");
        expect(detectWorkNature("pagination is not working")).toBe("bugfix");
    });
    it("defaults to feature for ambiguous or neutral descriptions", () => {
        expect(detectWorkNature("add user pagination")).toBe("feature");
        expect(detectWorkNature("implement dark mode")).toBe("feature");
        expect(detectWorkNature("新增导出功能")).toBe("feature");
        expect(detectWorkNature("")).toBe("feature");
    });
});
// ---------------------------------------------------------------------------
// Property 34: WorkNature × Tier mapping correctness
// **Validates: Requirements 11.1, 11.2, 11.9, 11.10**
// ---------------------------------------------------------------------------
describe("Property 34: WorkNature × Tier mapping", () => {
    it("feature + any tier returns the tier name as sequence key", () => {
        fc.assert(fc.property(tierArb, (tier) => {
            expect(getWorkNatureSequenceKey("feature", tier)).toBe(tier);
        }), { numRuns: 50 });
    });
    it("refactor + light returns 'refactor_light'", () => {
        expect(getWorkNatureSequenceKey("refactor", "light")).toBe("refactor_light");
    });
    it("refactor + standard returns 'refactor_standard'", () => {
        expect(getWorkNatureSequenceKey("refactor", "standard")).toBe("refactor_standard");
    });
    it("refactor + full returns 'refactor_standard'", () => {
        expect(getWorkNatureSequenceKey("refactor", "full")).toBe("refactor_standard");
    });
    it("bugfix + light returns 'fix_light'", () => {
        expect(getWorkNatureSequenceKey("bugfix", "light")).toBe("fix_light");
    });
    it("bugfix + standard returns 'fix_standard'", () => {
        expect(getWorkNatureSequenceKey("bugfix", "standard")).toBe("fix_standard");
    });
    it("bugfix + full returns 'fix_standard'", () => {
        expect(getWorkNatureSequenceKey("bugfix", "full")).toBe("fix_standard");
    });
    it("all WorkNature × Tier combinations produce a valid string key", () => {
        fc.assert(fc.property(workNatureArb, tierArb, (nature, tier) => {
            const key = getWorkNatureSequenceKey(nature, tier);
            expect(typeof key).toBe("string");
            expect(key.length).toBeGreaterThan(0);
        }), { numRuns: 40 });
    });
});
// ---------------------------------------------------------------------------
// Property 35: classifyTask includes work_nature in result
// **Validates: Requirements 11.9, 12.7, 12.8**
// ---------------------------------------------------------------------------
describe("Property 35: classifyTask work_nature field", () => {
    it("classifyTask returns work_nature field", () => {
        fc.assert(fc.property(taskSignalsArb, workNatureArb, (signals, nature) => {
            const result = classifyTask(signals, undefined, undefined, "fullstack", "iteration", nature);
            expect(result).toHaveProperty("work_nature");
            expect(result.work_nature).toBe(nature);
        }), { numRuns: 50 });
    });
    it("classifyTask defaults work_nature to 'feature' when not provided", () => {
        fc.assert(fc.property(taskSignalsArb, (signals) => {
            const result = classifyTask(signals);
            expect(result.work_nature).toBe("feature");
        }), { numRuns: 40 });
    });
    it("work_nature does not affect tier classification (but may affect commandSequence)", () => {
        fc.assert(fc.property(taskSignalsArb, workNatureArb, workNatureArb, (signals, n1, n2) => {
            const r1 = classifyTask(signals, undefined, undefined, "fullstack", "iteration", n1);
            const r2 = classifyTask(signals, undefined, undefined, "fullstack", "iteration", n2);
            // Tier is derived purely from TaskSignals, independent of workNature.
            expect(r1.tier).toBe(r2.tier);
        }), { numRuns: 50 });
    });
    // NOTE (audit-remediate-0619复核): 初版审计报告 P0-1 认为 router 丢失 workNature
    // 导致 router/scheduler 序列不一致。经 workflow-graph 核实：getRouterSequence 返回
    // 的是 routerPhases（路由阶段），对 feature/refactor/bugfix 在同 tier 下**设计为相同**
    // （如 light tier 三者均为 ['build','review']）；workNature 的差异体现在
    // schedulerPhases（skill-scheduler.getCommandSequence），由 sdk-status-helpers 使用。
    // 因此 router 用 getRouterSequence(tier) 不传 workNature 是符合设计的——routerPhases
    // 本就不依赖 workNature。下方断言固化这一设计契约，防止误"修复"。
    it("classifyTask commandSequence equals getRouterSequence(tier) (routerPhases are workNature-agnostic by design)", () => {
        fc.assert(fc.property(tierArb, workNatureArb, (tier, nature) => {
            const seq = classifyTask({
                filesAffected: 1,
                linesChanged: 5,
                hasExistingSpec: true,
                hasNewService: false,
                hasNewDatabase: false,
                hasAuthChanges: false,
                isVagueRequirement: false,
                hasClearRequirements: true,
            }, tier, undefined, "fullstack", "iteration", nature).commandSequence;
            // routerPhases are identical across workNature within a tier.
            // getRouterSequence(tier) is exactly what classifyTask uses, and it
            // equals getRouterSequence(tier, nature) for all combos that have a
            // dedicated profile; for combos without one (e.g. full+bugfix) both
            // calls fall back to the same default, so classifyTask's choice of
            // getRouterSequence(tier) is the canonical, correct call.
            expect(seq).toEqual(getRouterSequence(tier));
        }), { numRuns: 30 });
    });
});
//# sourceMappingURL=router-worknature.property.test.js.map