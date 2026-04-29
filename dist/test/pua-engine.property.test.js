/**
 * Property-based tests for the pua-engine module.
 *
 * Covers:
 *   - Property 1: 压力等级确定性映射
 *   - Property 2: Stall 检测提升压力等级
 *   - Property 3: 任务类型到方法论的确定性映射
 *   - Property 4: 方法论切换链遍历正确性
 *   - Property 5: 失败模式检测正确性
 *   - Property 6: Stall 响应确定性映射
 *   - Property 7: 压力提示内容单调递增
 *   - Property 8: 压力提示上下文内容注入
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { advanceMethodology, buildPressurePrompt, detectFailurePattern, determinePressureLevel, FAILURE_PATTERN_COUNTERS, getMethodologyChain, getStallResponse, METHODOLOGY_DESCRIPTIONS, PROACTIVITY_GUIDANCE, SEVEN_POINT_CHECKLIST, selectMethodology, THREE_RED_LINES, UNIVERSAL_METHODOLOGY, } from "../src/pua-engine.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
/** Ordered pressure levels for numeric comparison. */
const PRESSURE_LEVEL_ORDER = {
    L0: 0,
    L1: 1,
    L2: 2,
    L3: 3,
    L4: 4,
};
/** All known task types. */
const KNOWN_TASK_TYPES = [
    "debug",
    "build",
    "research",
    "architecture",
    "performance",
    "review",
    "deploy",
    "general",
];
/** Expected task-type → methodology mapping. */
const EXPECTED_TASK_METHODOLOGY = {
    debug: "huawei-rca",
    build: "musk-algorithm",
    research: "baidu-search",
    architecture: "amazon-backwards",
    performance: "bytedance-ab",
    review: "jobs-a-player",
    deploy: "alibaba-closure",
    general: "alibaba-closure",
};
/** All failure patterns (used for chain generation). */
const ALL_FAILURE_PATTERNS = [
    "spinning",
    "giving-up",
    "low-quality",
    "guessing",
    "passive-waiting",
    "empty-claim",
];
/** All pressure levels in order. */
const ALL_PRESSURE_LEVELS = ["L0", "L1", "L2", "L3", "L4"];
/** All methodologies. */
const ALL_METHODOLOGIES = [
    "huawei-rca",
    "musk-algorithm",
    "baidu-search",
    "amazon-backwards",
    "bytedance-ab",
    "alibaba-closure",
    "netflix-keeper",
    "jobs-a-player",
];
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/**
 * Generate strings that do NOT contain any of the failure-pattern trigger
 * keywords (English or Chinese). Used for Property 5 negative case.
 */
const TRIGGER_KEYWORDS = [
    "无法解决",
    "超出范围",
    "建议手动",
    "环境问题",
    "cannot",
    "unable",
    "out of scope",
    "manual",
    "已完成",
    "done",
    "completed",
    "fixed",
    "等待用户",
    "需要确认",
    "waiting",
    "need confirmation",
    "可能是",
    "probably",
    "might be",
    "i think",
];
/** Arbitrary string guaranteed to contain none of the trigger keywords. */
const safeStringArb = fc.string({ minLength: 1, maxLength: 40 }).filter((s) => {
    const lower = s.toLowerCase();
    return TRIGGER_KEYWORDS.every((kw) => !lower.includes(kw));
});
/**
 * Arbitrary array of safe strings (no trigger keywords) — used to verify
 * that detectFailurePattern returns null for benign summaries.
 */
const safeSummaryHistoryArb = fc.array(safeStringArb, {
    minLength: 1,
    maxLength: 5,
});
// ---------------------------------------------------------------------------
// Feature: pua-quality-engine, Property 1: 压力等级确定性映射
// ---------------------------------------------------------------------------
describe("Feature: pua-quality-engine, Property 1: 压力等级确定性映射", () => {
    /**
     * **Validates: Requirements 1.3, 1.4, 1.5, 1.6, 1.7**
     *
     * For any non-negative integer `consecutiveFailures` (with stallDetected
     * = false), determinePressureLevel should return the correct level:
     *   0-1 → L0, 2 → L1, 3 → L2, 4 → L3, 5+ → L4
     */
    it("maps consecutive failures to the correct pressure level without stall", () => {
        fc.assert(fc.property(fc.nat({ max: 100 }), (failures) => {
            const level = determinePressureLevel(failures, false);
            if (failures <= 1) {
                expect(level).toBe("L0");
            }
            else if (failures === 2) {
                expect(level).toBe("L1");
            }
            else if (failures === 3) {
                expect(level).toBe("L2");
            }
            else if (failures === 4) {
                expect(level).toBe("L3");
            }
            else {
                expect(level).toBe("L4");
            }
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Feature: pua-quality-engine, Property 2: Stall 检测提升压力等级
// ---------------------------------------------------------------------------
describe("Feature: pua-quality-engine, Property 2: Stall 检测提升压力等级", () => {
    /**
     * **Validates: Requirements 1.8**
     *
     * For any non-negative integer `consecutiveFailures`,
     * determinePressureLevel(n, true) should return a level >= the level
     * returned by determinePressureLevel(n, false), and must promote by at
     * least one level (unless already L4).
     */
    it("stall detection promotes pressure level by at least one (capped at L4)", () => {
        fc.assert(fc.property(fc.nat({ max: 100 }), (failures) => {
            const baseLevel = determinePressureLevel(failures, false);
            const stallLevel = determinePressureLevel(failures, true);
            const baseIdx = PRESSURE_LEVEL_ORDER[baseLevel];
            const stallIdx = PRESSURE_LEVEL_ORDER[stallLevel];
            // Stall level must be >= base level
            expect(stallIdx).toBeGreaterThanOrEqual(baseIdx);
            // Must promote by at least one level, unless already L4
            if (baseLevel !== "L4") {
                expect(stallIdx).toBeGreaterThan(baseIdx);
            }
            // Never exceeds L4
            expect(stallIdx).toBeLessThanOrEqual(4);
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Feature: pua-quality-engine, Property 3: 任务类型到方法论的确定性映射
// ---------------------------------------------------------------------------
describe("Feature: pua-quality-engine, Property 3: 任务类型到方法论的确定性映射", () => {
    /**
     * **Validates: Requirements 2.3, 2.4, 2.5, 2.6, 2.7, 2.8**
     *
     * For any known task type, selectMethodology returns the expected fixed
     * methodology. For any unknown string, it returns alibaba-closure.
     */
    it("known task types return their fixed methodology", () => {
        fc.assert(fc.property(fc.constantFrom(...KNOWN_TASK_TYPES), (taskType) => {
            const methodology = selectMethodology(taskType);
            expect(methodology).toBe(EXPECTED_TASK_METHODOLOGY[taskType]);
        }), { numRuns: 100 });
    });
    it("unknown task types return alibaba-closure as default", () => {
        fc.assert(fc.property(fc
            .string({ minLength: 1, maxLength: 30 })
            .filter((s) => !KNOWN_TASK_TYPES.includes(s)), (unknownType) => {
            const methodology = selectMethodology(unknownType);
            expect(methodology).toBe("alibaba-closure");
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Feature: pua-quality-engine, Property 4: 方法论切换链遍历正确性
// ---------------------------------------------------------------------------
describe("Feature: pua-quality-engine, Property 4: 方法论切换链遍历正确性", () => {
    /**
     * **Validates: Requirements 2.16**
     *
     * For any methodology chain and valid index i (0 <= i < chain.length - 1),
     * advanceMethodology returns chain[i+1]. For i >= chain.length - 1,
     * it returns null.
     */
    it("returns chain[i+1] for valid indices and null for out-of-bounds", () => {
        fc.assert(fc.property(fc.constantFrom(...ALL_FAILURE_PATTERNS), fc.nat({ max: 10 }), (pattern, index) => {
            const chain = getMethodologyChain(pattern);
            const result = advanceMethodology(chain, index);
            if (index < chain.length - 1) {
                expect(result).toBe(chain[index + 1]);
            }
            else {
                expect(result).toBeNull();
            }
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Feature: pua-quality-engine, Property 5: 失败模式检测正确性
// ---------------------------------------------------------------------------
describe("Feature: pua-quality-engine, Property 5: 失败模式检测正确性", () => {
    /**
     * **Validates: Requirements 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**
     *
     * Summaries without any trigger keywords should return null.
     */
    it("returns null for summaries without trigger keywords", () => {
        fc.assert(fc.property(safeSummaryHistoryArb, (summaries) => {
            const result = detectFailurePattern(summaries);
            // If no trigger keywords are present, the only possible non-null
            // result is "spinning" (keyword overlap). We filter that out by
            // checking: if result is not null, it must be spinning (from
            // Jaccard overlap of safe strings that happen to be similar).
            if (result !== null) {
                expect(result).toBe("spinning");
            }
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 3.3**
     *
     * Summaries containing giving-up keywords return "giving-up".
     */
    it("detects giving-up pattern from trigger keywords", () => {
        const givingUpKeywords = [
            "cannot",
            "unable",
            "out of scope",
            "manual",
            "无法解决",
            "超出范围",
            "建议手动",
            "环境问题",
        ];
        fc.assert(fc.property(fc.constantFrom(...givingUpKeywords), (keyword) => {
            const result = detectFailurePattern([`The task ${keyword} proceed`]);
            expect(result).toBe("giving-up");
        }), { numRuns: 100 });
    });
    /**
     * **Validates: Requirements 3.4**
     *
     * Summaries containing empty-claim trigger keywords (without exclusion
     * keywords) return "empty-claim".
     */
    it("detects empty-claim pattern from trigger keywords without exclusion", () => {
        const emptyClaimKeywords = ["done", "completed", "fixed", "已完成"];
        fc.assert(fc.property(fc.constantFrom(...emptyClaimKeywords), (keyword) => {
            const result = detectFailurePattern([`Task is ${keyword} now`]);
            expect(result).toBe("empty-claim");
        }), { numRuns: 100 });
    });
    /**
     * **Validates: Requirements 3.5**
     *
     * Summaries containing passive-waiting trigger keywords (without
     * exclusion keywords) return "passive-waiting".
     */
    it("detects passive-waiting pattern from trigger keywords without exclusion", () => {
        const passiveKeywords = ["waiting", "need confirmation", "等待用户", "需要确认"];
        fc.assert(fc.property(fc.constantFrom(...passiveKeywords), (keyword) => {
            const result = detectFailurePattern([`Currently ${keyword} for input`]);
            expect(result).toBe("passive-waiting");
        }), { numRuns: 100 });
    });
    /**
     * **Validates: Requirements 3.6**
     *
     * Summaries containing guessing trigger keywords (without exclusion
     * keywords) return "guessing".
     */
    it("detects guessing pattern from trigger keywords without exclusion", () => {
        const guessingKeywords = ["probably", "might be", "可能是", "i think"];
        fc.assert(fc.property(fc.constantFrom(...guessingKeywords), (keyword) => {
            const result = detectFailurePattern([`The issue ${keyword} related to config`]);
            expect(result).toBe("guessing");
        }), { numRuns: 100 });
    });
    /**
     * **Validates: Requirements 3.7**
     *
     * Empty summary array returns null.
     */
    it("returns null for empty summary array", () => {
        expect(detectFailurePattern([])).toBeNull();
    });
});
// ---------------------------------------------------------------------------
// Feature: pua-quality-engine, Property 6: Stall 响应确定性映射
// ---------------------------------------------------------------------------
describe("Feature: pua-quality-engine, Property 6: Stall 响应确定性映射", () => {
    /**
     * **Validates: Requirements 3.9, 3.10, 3.11**
     *
     * For any non-negative integer `consecutiveFailures`, getStallResponse
     * returns the correct strategy: 1-2 → remind, 3-4 → reassess,
     * 5+ → force-pivot. 0 or negative → remind (defensive default).
     */
    it("maps consecutive failures to the correct stall response", () => {
        fc.assert(fc.property(fc.nat({ max: 100 }), (failures) => {
            const response = getStallResponse(failures);
            if (failures >= 5) {
                expect(response).toBe("force-pivot");
            }
            else if (failures >= 3) {
                expect(response).toBe("reassess");
            }
            else {
                expect(response).toBe("remind");
            }
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Feature: audit-remediation-v221, Property 6: PUA pressure level monotonicity
// ---------------------------------------------------------------------------
describe("Feature: audit-remediation-v221, Property 6: PUA pressure level monotonicity", () => {
    /**
     * **Validates: Requirements 17.3**
     *
     * For any sequence of increasing `consecutiveFailures` values with
     * `stallDetected` held constant, `determinePressureLevel` returns
     * non-decreasing pressure levels — i.e., the ordinal index of the
     * returned level shall never decrease as `consecutiveFailures` increases.
     */
    it("pressure levels are non-decreasing as consecutiveFailures increases (stallDetected constant)", () => {
        fc.assert(fc.property(fc.nat({ max: 50 }), fc.nat({ max: 50 }), fc.boolean(), (a, b, stallDetected) => {
            // Ensure low <= high by sorting
            const low = Math.min(a, b);
            const high = Math.max(a, b);
            const levelLow = determinePressureLevel(low, stallDetected);
            const levelHigh = determinePressureLevel(high, stallDetected);
            const idxLow = PRESSURE_LEVEL_ORDER[levelLow];
            const idxHigh = PRESSURE_LEVEL_ORDER[levelHigh];
            // Non-decreasing: higher failures must not produce a lower pressure level
            expect(idxHigh).toBeGreaterThanOrEqual(idxLow);
        }), { numRuns: 200 });
    });
    it("pressure levels are non-decreasing across a full increasing sequence", () => {
        fc.assert(fc.property(fc.array(fc.nat({ max: 100 }), { minLength: 2, maxLength: 10 }), fc.boolean(), (values, stallDetected) => {
            // Sort to get an increasing sequence
            const sorted = [...values].sort((a, b) => a - b);
            const levels = sorted.map((f) => determinePressureLevel(f, stallDetected));
            const indices = levels.map((l) => PRESSURE_LEVEL_ORDER[l]);
            // Verify non-decreasing
            for (let i = 1; i < indices.length; i++) {
                expect(indices[i]).toBeGreaterThanOrEqual(indices[i - 1]);
            }
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Feature: pua-quality-engine, Property 7: 压力提示内容单调递增
// ---------------------------------------------------------------------------
describe("Feature: pua-quality-engine, Property 7: 压力提示内容单调递增", () => {
    /**
     * **Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6, 4.9, 4.10, 5.5**
     *
     * For any pair of pressure levels L_low < L_high, the prompt for L_high
     * contains ALL core content from L_low's prompt. All levels always
     * contain THREE_RED_LINES and PROACTIVITY_GUIDANCE.
     */
    it("all pressure levels contain THREE_RED_LINES and PROACTIVITY_GUIDANCE", () => {
        fc.assert(fc.property(fc.constantFrom(...ALL_PRESSURE_LEVELS), (level) => {
            const prompt = buildPressurePrompt(level, null, null, null);
            expect(prompt).toContain(THREE_RED_LINES);
            expect(prompt).toContain(PROACTIVITY_GUIDANCE);
        }), { numRuns: 100 });
    });
    it("higher pressure level prompts contain all core content from lower levels", () => {
        const levelPairArb = fc
            .tuple(fc.constantFrom(...ALL_PRESSURE_LEVELS), fc.constantFrom(...ALL_PRESSURE_LEVELS))
            .filter(([a, b]) => PRESSURE_LEVEL_ORDER[a] < PRESSURE_LEVEL_ORDER[b]);
        fc.assert(fc.property(levelPairArb, ([lowLevel, highLevel]) => {
            const lowPrompt = buildPressurePrompt(lowLevel, null, null, null);
            const highPrompt = buildPressurePrompt(highLevel, null, null, null);
            const coreSections = [
                THREE_RED_LINES,
                PROACTIVITY_GUIDANCE,
                UNIVERSAL_METHODOLOGY,
                SEVEN_POINT_CHECKLIST,
            ];
            for (const section of coreSections) {
                if (lowPrompt.includes(section)) {
                    expect(highPrompt).toContain(section);
                }
            }
        }), { numRuns: 100 });
    });
    it("L2+ prompts contain UNIVERSAL_METHODOLOGY", () => {
        const l2PlusArb = fc.constantFrom("L2", "L3", "L4");
        fc.assert(fc.property(l2PlusArb, (level) => {
            const prompt = buildPressurePrompt(level, null, null, null);
            expect(prompt).toContain(UNIVERSAL_METHODOLOGY);
        }), { numRuns: 100 });
    });
    it("L3+ prompts contain SEVEN_POINT_CHECKLIST", () => {
        const l3PlusArb = fc.constantFrom("L3", "L4");
        fc.assert(fc.property(l3PlusArb, (level) => {
            const prompt = buildPressurePrompt(level, null, null, null);
            expect(prompt).toContain(SEVEN_POINT_CHECKLIST);
        }), { numRuns: 100 });
    });
});
// ---------------------------------------------------------------------------
// Feature: pua-quality-engine, Property 8: 压力提示上下文内容注入
// ---------------------------------------------------------------------------
describe("Feature: pua-quality-engine, Property 8: 压力提示上下文内容注入", () => {
    /**
     * **Validates: Requirements 4.7**
     *
     * When methodology is not null, the output contains
     * METHODOLOGY_DESCRIPTIONS[methodology].
     */
    it("injects methodology description when methodology is provided", () => {
        fc.assert(fc.property(fc.constantFrom(...ALL_PRESSURE_LEVELS), fc.constantFrom(...ALL_METHODOLOGIES), (level, methodology) => {
            const prompt = buildPressurePrompt(level, methodology, null, null);
            expect(prompt).toContain(METHODOLOGY_DESCRIPTIONS[methodology]);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 4.8**
     *
     * When failurePattern is not null, the output contains
     * FAILURE_PATTERN_COUNTERS[failurePattern].
     */
    it("injects failure pattern counter when failure pattern is provided", () => {
        fc.assert(fc.property(fc.constantFrom(...ALL_PRESSURE_LEVELS), fc.constantFrom(...ALL_FAILURE_PATTERNS), (level, pattern) => {
            const prompt = buildPressurePrompt(level, null, pattern, null);
            expect(prompt).toContain(FAILURE_PATTERN_COUNTERS[pattern]);
        }), { numRuns: 200 });
    });
    /**
     * **Validates: Requirements 4.7, 4.8**
     *
     * When both methodology and failurePattern are provided, the output
     * contains both the methodology description and the failure counter.
     */
    it("injects both methodology description and failure counter when both provided", () => {
        fc.assert(fc.property(fc.constantFrom(...ALL_PRESSURE_LEVELS), fc.constantFrom(...ALL_METHODOLOGIES), fc.constantFrom(...ALL_FAILURE_PATTERNS), (level, methodology, pattern) => {
            const prompt = buildPressurePrompt(level, methodology, pattern, null);
            expect(prompt).toContain(METHODOLOGY_DESCRIPTIONS[methodology]);
            expect(prompt).toContain(FAILURE_PATTERN_COUNTERS[pattern]);
        }), { numRuns: 200 });
    });
});
//# sourceMappingURL=pua-engine.property.test.js.map