/**
 * Property 1: Router 分类正确性
 *
 * Uses fast-check to generate TaskSignals with complexity signals and verifies
 * that the Router classification result matches the tier indicated by the signals.
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { classifyTask, } from "../src/router.js";
// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------
/** Arbitrary that produces a valid TaskSignals object. */
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
/**
 * Generates signals that are guaranteed to trigger the "full" tier.
 * At least one full signal is true.
 */
const fullSignalsArb = taskSignalsArb.filter((s) => s.hasNewService || s.hasNewDatabase || s.hasAuthChanges || s.isVagueRequirement);
/**
 * Generates signals that trigger "standard" tier:
 * - No full signals
 * - At least one standard signal (hasExistingSpec or hasClearRequirements)
 */
const standardSignalsArb = taskSignalsArb
    .map((s) => ({
    ...s,
    hasNewService: false,
    hasNewDatabase: false,
    hasAuthChanges: false,
    isVagueRequirement: false,
}))
    .filter((s) => s.hasExistingSpec || s.hasClearRequirements);
/**
 * Generates signals that trigger "light" tier:
 * - No full signals
 * - No standard signals
 * - filesAffected ≤ 1 AND linesChanged ≤ 20
 */
const lightSignalsArb = fc.record({
    filesAffected: fc.integer({ min: 0, max: 1 }),
    linesChanged: fc.integer({ min: 0, max: 20 }),
    hasExistingSpec: fc.constant(false),
    hasNewService: fc.constant(false),
    hasNewDatabase: fc.constant(false),
    hasAuthChanges: fc.constant(false),
    isVagueRequirement: fc.constant(false),
    hasClearRequirements: fc.constant(false),
});
/**
 * Generates signals that fall through to the default tier:
 * - No full signals
 * - No standard signals
 * - NOT light (filesAffected > 1 OR linesChanged > 20)
 */
const defaultSignalsArb = fc
    .record({
    filesAffected: fc.integer({ min: 0, max: 100 }),
    linesChanged: fc.integer({ min: 0, max: 5000 }),
    hasExistingSpec: fc.constant(false),
    hasNewService: fc.constant(false),
    hasNewDatabase: fc.constant(false),
    hasAuthChanges: fc.constant(false),
    isVagueRequirement: fc.constant(false),
    hasClearRequirements: fc.constant(false),
})
    .filter((s) => s.filesAffected > 1 || s.linesChanged > 20);
// ---------------------------------------------------------------------------
// Expected command sequences
// ---------------------------------------------------------------------------
const EXPECTED_SEQUENCES = {
    light: ["build", "review"],
    standard: ["plan", "build", "review", "test", "ship"],
    full: ["decide", "spec", "plan", "build", "review", "test", "ship", "learn"],
};
// ---------------------------------------------------------------------------
// Property tests
// ---------------------------------------------------------------------------
describe("Property 1: Router 分类正确性", () => {
    it('full signals → tier is "full" (Req 1.4: 涉及新服务/新数据库/认证体系变更或需求模糊 → 全量)', () => {
        fc.assert(fc.property(fullSignalsArb, (signals) => {
            const result = classifyTask(signals);
            expect(result.tier).toBe("full");
            expect(result.commandSequence).toEqual(EXPECTED_SEQUENCES.full);
        }), { numRuns: 50 });
    });
    it('standard signals (no full signals) → tier is "standard" (Req 1.3: 有明确需求或现成 Spec → 标准)', () => {
        fc.assert(fc.property(standardSignalsArb, (signals) => {
            const result = classifyTask(signals);
            expect(result.tier).toBe("standard");
            expect(result.commandSequence).toEqual(EXPECTED_SEQUENCES.standard);
        }), { numRuns: 50 });
    });
    it('light signals (no full/standard signals, files ≤ 1, lines ≤ 20) → tier is "light" (Req 1.2)', () => {
        fc.assert(fc.property(lightSignalsArb, (signals) => {
            const result = classifyTask(signals);
            expect(result.tier).toBe("light");
            expect(result.commandSequence).toEqual(EXPECTED_SEQUENCES.light);
        }), { numRuns: 50 });
    });
    it('no signals match → default tier is "standard" (Req 1.1: 默认标准)', () => {
        fc.assert(fc.property(defaultSignalsArb, (signals) => {
            const result = classifyTask(signals);
            expect(result.tier).toBe("standard");
            expect(result.commandSequence).toEqual(EXPECTED_SEQUENCES.standard);
        }), { numRuns: 50 });
    });
    it("full signals always take priority over standard and light signals", () => {
        fc.assert(fc.property(taskSignalsArb.filter((s) => 
        // Has at least one full signal AND at least one standard/light signal
        (s.hasNewService || s.hasNewDatabase || s.hasAuthChanges || s.isVagueRequirement) &&
            (s.hasExistingSpec ||
                s.hasClearRequirements ||
                (s.filesAffected <= 1 && s.linesChanged <= 20))), (signals) => {
            const result = classifyTask(signals);
            expect(result.tier).toBe("full");
            expect(result.commandSequence).toEqual(EXPECTED_SEQUENCES.full);
        }), { numRuns: 50 });
    });
    it("standard signals take priority over light signals", () => {
        fc.assert(fc.property(fc
            .record({
            filesAffected: fc.integer({ min: 0, max: 1 }),
            linesChanged: fc.integer({ min: 0, max: 20 }),
            hasExistingSpec: fc.boolean(),
            hasNewService: fc.constant(false),
            hasNewDatabase: fc.constant(false),
            hasAuthChanges: fc.constant(false),
            isVagueRequirement: fc.constant(false),
            hasClearRequirements: fc.boolean(),
        })
            .filter((s) => s.hasExistingSpec || s.hasClearRequirements), (signals) => {
            // Even though light conditions are met, standard signals win
            const result = classifyTask(signals);
            expect(result.tier).toBe("standard");
            expect(result.commandSequence).toEqual(EXPECTED_SEQUENCES.standard);
        }), { numRuns: 50 });
    });
    it("classification always returns a valid command sequence for the assigned tier", () => {
        fc.assert(fc.property(taskSignalsArb, (signals) => {
            const result = classifyTask(signals);
            expect(["light", "standard", "full"]).toContain(result.tier);
            expect(result.commandSequence).toEqual(EXPECTED_SEQUENCES[result.tier]);
            expect(result.reason).toBeTruthy();
        }), { numRuns: 40 });
    });
});
// ---------------------------------------------------------------------------
// Property 23: Brownfield boost — light → standard for brownfield projects
// ---------------------------------------------------------------------------
describe("Property 23: Brownfield boost", () => {
    const brownfieldTouchingModules = {
        projectType: "brownfield",
        touchesExistingModules: true,
    };
    const brownfieldNotTouching = {
        projectType: "brownfield",
        touchesExistingModules: false,
    };
    const greenfieldContext = {
        projectType: "greenfield",
        touchesExistingModules: true,
    };
    const unknownContext = {
        projectType: "unknown",
        touchesExistingModules: true,
    };
    it("brownfield + touches existing modules boosts light → standard", () => {
        fc.assert(fc.property(lightSignalsArb, (signals) => {
            const result = classifyTask(signals, undefined, brownfieldTouchingModules);
            expect(result.tier).toBe("standard");
            expect(result.reason).toContain("棕地");
        }), { numRuns: 50 });
    });
    it("brownfield + NOT touching existing modules stays light", () => {
        fc.assert(fc.property(lightSignalsArb, (signals) => {
            const result = classifyTask(signals, undefined, brownfieldNotTouching);
            expect(result.tier).toBe("light");
        }), { numRuns: 50 });
    });
    it("greenfield context does not boost light", () => {
        fc.assert(fc.property(lightSignalsArb, (signals) => {
            const result = classifyTask(signals, undefined, greenfieldContext);
            expect(result.tier).toBe("light");
        }), { numRuns: 50 });
    });
    it("unknown context does not boost light", () => {
        fc.assert(fc.property(lightSignalsArb, (signals) => {
            const result = classifyTask(signals, undefined, unknownContext);
            expect(result.tier).toBe("light");
        }), { numRuns: 50 });
    });
    it("brownfield boost does not affect full signals", () => {
        fc.assert(fc.property(fullSignalsArb, (signals) => {
            const result = classifyTask(signals, undefined, brownfieldTouchingModules);
            expect(result.tier).toBe("full");
        }), { numRuns: 50 });
    });
    it("brownfield boost does not affect standard signals", () => {
        fc.assert(fc.property(standardSignalsArb, (signals) => {
            const result = classifyTask(signals, undefined, brownfieldTouchingModules);
            expect(result.tier).toBe("standard");
        }), { numRuns: 50 });
    });
    it("user override still wins over brownfield boost", () => {
        fc.assert(fc.property(lightSignalsArb, (signals) => {
            const result = classifyTask(signals, "light", brownfieldTouchingModules);
            expect(result.tier).toBe("light");
        }), { numRuns: 50 });
    });
    it("no project context behaves like v1.0 (backward compatible)", () => {
        fc.assert(fc.property(taskSignalsArb, (signals) => {
            const withContext = classifyTask(signals, undefined, undefined);
            const without = classifyTask(signals);
            expect(withContext.tier).toBe(without.tier);
        }), { numRuns: 40 });
    });
});
// ---------------------------------------------------------------------------
// Property 11: Brownfield boost classification
// **Validates: Requirements 22.1**
// ---------------------------------------------------------------------------
/**
 * Tier ordering for comparison: light < standard < full.
 */
const TIER_ORDER = {
    light: 0,
    standard: 1,
    full: 2,
};
/** Arbitrary that produces a valid ProjectContext with brownfield + touchesExistingModules. */
const brownfieldTouchingArb = fc.record({
    projectType: fc.constant("brownfield"),
    touchesExistingModules: fc.constant(true),
});
/** Arbitrary that produces any valid ProjectContext. */
const _projectContextArb = fc.record({
    projectType: fc.constantFrom("greenfield", "brownfield", "unknown"),
    touchesExistingModules: fc.boolean(),
});
/**
 * Generates TaskSignals where hasAuthChanges or hasNewService is true
 * (the brownfield-relevant high-complexity signals).
 */
const signalsWithAuthOrServiceArb = fc
    .record({
    filesAffected: fc.integer({ min: 0, max: 100 }),
    linesChanged: fc.integer({ min: 0, max: 5000 }),
    hasExistingSpec: fc.boolean(),
    hasNewService: fc.boolean(),
    hasNewDatabase: fc.boolean(),
    hasAuthChanges: fc.boolean(),
    isVagueRequirement: fc.boolean(),
    hasClearRequirements: fc.boolean(),
})
    .filter((s) => s.hasAuthChanges || s.hasNewService);
describe("Property 11: Brownfield boost classification", () => {
    it("brownfield + touchesExistingModules + (hasAuthChanges or hasNewService) → tier is at least standard", () => {
        fc.assert(fc.property(signalsWithAuthOrServiceArb, brownfieldTouchingArb, (signals, context) => {
            const result = classifyTask(signals, undefined, context);
            expect(TIER_ORDER[result.tier]).toBeGreaterThanOrEqual(TIER_ORDER.standard);
        }), { numRuns: 50 });
    });
    it("brownfield + touchesExistingModules with any signals → tier is at least standard (boost ensures no light)", () => {
        fc.assert(fc.property(taskSignalsArb, brownfieldTouchingArb, (signals, context) => {
            const result = classifyTask(signals, undefined, context);
            // Brownfield boost promotes light → standard, so tier is never light
            // unless a user override forces it
            expect(TIER_ORDER[result.tier]).toBeGreaterThanOrEqual(TIER_ORDER.standard);
        }), { numRuns: 50 });
    });
    it("non-brownfield context does not affect tier when hasAuthChanges or hasNewService", () => {
        const nonBrownfieldArb = fc.record({
            projectType: fc.constantFrom("greenfield", "unknown"),
            touchesExistingModules: fc.boolean(),
        });
        fc.assert(fc.property(signalsWithAuthOrServiceArb, nonBrownfieldArb, (signals, context) => {
            const withContext = classifyTask(signals, undefined, context);
            const withoutContext = classifyTask(signals);
            // hasAuthChanges/hasNewService trigger full via hasFullSignals regardless of context
            expect(withContext.tier).toBe(withoutContext.tier);
        }), { numRuns: 50 });
    });
});
// ---------------------------------------------------------------------------
// Property: Routing assumptions field
// Validates: routing-assumptions spec Requirement 3
// ---------------------------------------------------------------------------
describe("Property: Routing assumptions field", () => {
    it("classifyTask always returns an assumptions field that is a string array", () => {
        fc.assert(fc.property(taskSignalsArb, (signals) => {
            const result = classifyTask(signals);
            expect(result).toHaveProperty("assumptions");
            expect(Array.isArray(result.assumptions)).toBe(true);
            for (const a of result.assumptions) {
                expect(typeof a).toBe("string");
            }
        }), { numRuns: 40 });
    });
    it("classifyTask returns assumptions as a string array", () => {
        fc.assert(fc.property(taskSignalsArb, (signals) => {
            const result = classifyTask(signals);
            expect(Array.isArray(result.assumptions)).toBe(true);
            for (const a of result.assumptions) {
                expect(typeof a).toBe("string");
                expect(a.length).toBeGreaterThan(0);
            }
        }), { numRuns: 50 });
    });
});
//# sourceMappingURL=router.property.test.js.map