/**
 * Property tests for the multi-dimensional routing system (v2.0).
 *
 * Tests the two new routing dimensions:
 *   - TaskType (domain): frontend / backend / fullstack / data / infra / docs
 *   - ProjectPhase (lifecycle): greenfield / iteration / refactor / bugfix
 *
 * And the hint generation system that produces behavioral hints for
 * downstream commands based on these dimensions.
 *
 * **Validates: Requirements 2.1–2.8**
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { classifyTask, generateHints, } from "../src/router.js";
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
const taskTypeArb = fc.constantFrom("frontend", "backend", "fullstack", "data", "infra", "docs");
const projectPhaseArb = fc.constantFrom("greenfield", "iteration", "refactor", "bugfix");
const tierArb = fc.constantFrom("light", "standard", "full");
const EXPECTED_SEQUENCES = {
    light: ["build", "review"],
    standard: ["plan", "build", "review", "test", "ship"],
    full: ["decide", "spec", "plan", "build", "review", "test", "ship", "learn"],
};
// ---------------------------------------------------------------------------
// Property 24: Backward compatibility — new params default gracefully
// ---------------------------------------------------------------------------
describe("Property 24: Backward compatibility", () => {
    it("classifyTask without taskType/projectPhase returns same tier as before", () => {
        fc.assert(fc.property(taskSignalsArb, (signals) => {
            const withDefaults = classifyTask(signals);
            const withExplicit = classifyTask(signals, undefined, undefined, "fullstack", "iteration");
            expect(withDefaults.tier).toBe(withExplicit.tier);
            expect(withDefaults.commandSequence).toEqual(withExplicit.commandSequence);
        }), { numRuns: 200 });
    });
    it("default taskType is fullstack", () => {
        fc.assert(fc.property(taskSignalsArb, (signals) => {
            const result = classifyTask(signals);
            expect(result.taskType).toBe("fullstack");
        }), { numRuns: 100 });
    });
    it("default projectPhase is iteration", () => {
        fc.assert(fc.property(taskSignalsArb, (signals) => {
            const result = classifyTask(signals);
            expect(result.projectPhase).toBe("iteration");
        }), { numRuns: 100 });
    });
});
// ---------------------------------------------------------------------------
// Property 25: TaskType and ProjectPhase do NOT affect tier
// ---------------------------------------------------------------------------
describe("Property 25: Dimensions do not affect tier", () => {
    it("tier is identical regardless of taskType", () => {
        fc.assert(fc.property(taskSignalsArb, taskTypeArb, taskTypeArb, (signals, t1, t2) => {
            const r1 = classifyTask(signals, undefined, undefined, t1, "iteration");
            const r2 = classifyTask(signals, undefined, undefined, t2, "iteration");
            expect(r1.tier).toBe(r2.tier);
            expect(r1.commandSequence).toEqual(r2.commandSequence);
        }), { numRuns: 200 });
    });
    it("tier is identical regardless of projectPhase", () => {
        fc.assert(fc.property(taskSignalsArb, projectPhaseArb, projectPhaseArb, (signals, p1, p2) => {
            const r1 = classifyTask(signals, undefined, undefined, "fullstack", p1);
            const r2 = classifyTask(signals, undefined, undefined, "fullstack", p2);
            expect(r1.tier).toBe(r2.tier);
            expect(r1.commandSequence).toEqual(r2.commandSequence);
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Property 26: Hints only reference commands in the active sequence
// ---------------------------------------------------------------------------
describe("Property 26: Hints are scoped to active commands", () => {
    it("every hint.command exists in the commandSequence", () => {
        fc.assert(fc.property(taskSignalsArb, tierArb, taskTypeArb, projectPhaseArb, (signals, tier, taskType, phase) => {
            const result = classifyTask(signals, tier, undefined, taskType, phase);
            const commandSet = new Set(result.commandSequence);
            for (const hint of result.hints) {
                expect(commandSet.has(hint.command)).toBe(true);
            }
        }), { numRuns: 300 });
    });
    it("light tier never has hints for decide/spec/plan/test/ship/learn", () => {
        fc.assert(fc.property(taskTypeArb, projectPhaseArb, (taskType, phase) => {
            const hints = generateHints(taskType, phase, ["build", "review"]);
            const forbidden = new Set(["decide", "spec", "plan", "test", "ship", "learn"]);
            for (const hint of hints) {
                expect(forbidden.has(hint.command)).toBe(false);
            }
        }), { numRuns: 100 });
    });
});
// ---------------------------------------------------------------------------
// Property 27: Hints have no duplicates (by tag)
// ---------------------------------------------------------------------------
describe("Property 27: Hint deduplication", () => {
    it("no two hints share the same tag", () => {
        fc.assert(fc.property(taskTypeArb, projectPhaseArb, tierArb, (taskType, phase, tier) => {
            const hints = generateHints(taskType, phase, EXPECTED_SEQUENCES[tier]);
            const tags = hints.map((h) => h.tag);
            expect(new Set(tags).size).toBe(tags.length);
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Property 28: Specific task types produce expected hints
// ---------------------------------------------------------------------------
describe("Property 28: Domain-specific hints", () => {
    it("frontend tasks always get a11y-check hint on review", () => {
        fc.assert(fc.property(projectPhaseArb, (phase) => {
            // Use full tier to ensure review is in the sequence
            const hints = generateHints("frontend", phase, EXPECTED_SEQUENCES.full);
            const tags = hints.map((h) => h.tag);
            expect(tags).toContain("a11y-check");
        }), { numRuns: 50 });
    });
    it("frontend tasks always get responsive-check hint on review", () => {
        fc.assert(fc.property(projectPhaseArb, (phase) => {
            const hints = generateHints("frontend", phase, EXPECTED_SEQUENCES.full);
            const tags = hints.map((h) => h.tag);
            expect(tags).toContain("responsive-check");
        }), { numRuns: 50 });
    });
    it("backend tasks always get api-contract-check hint on review", () => {
        fc.assert(fc.property(projectPhaseArb, (phase) => {
            const hints = generateHints("backend", phase, EXPECTED_SEQUENCES.full);
            const tags = hints.map((h) => h.tag);
            expect(tags).toContain("api-contract-check");
        }), { numRuns: 50 });
    });
    it("backend tasks always get n-plus-one-check hint on review", () => {
        fc.assert(fc.property(projectPhaseArb, (phase) => {
            const hints = generateHints("backend", phase, EXPECTED_SEQUENCES.full);
            const tags = hints.map((h) => h.tag);
            expect(tags).toContain("n-plus-one-check");
        }), { numRuns: 50 });
    });
    it("data tasks get data-integrity-check hint on review", () => {
        fc.assert(fc.property(projectPhaseArb, (phase) => {
            const hints = generateHints("data", phase, EXPECTED_SEQUENCES.full);
            const tags = hints.map((h) => h.tag);
            expect(tags).toContain("data-integrity-check");
        }), { numRuns: 50 });
    });
    it("infra tasks get blast-radius hint on review", () => {
        fc.assert(fc.property(projectPhaseArb, (phase) => {
            const hints = generateHints("infra", phase, EXPECTED_SEQUENCES.full);
            const tags = hints.map((h) => h.tag);
            expect(tags).toContain("blast-radius");
        }), { numRuns: 50 });
    });
    it("docs tasks get accuracy-check hint on review", () => {
        fc.assert(fc.property(projectPhaseArb, (phase) => {
            const hints = generateHints("docs", phase, EXPECTED_SEQUENCES.full);
            const tags = hints.map((h) => h.tag);
            expect(tags).toContain("accuracy-check");
        }), { numRuns: 50 });
    });
});
// ---------------------------------------------------------------------------
// Property 29: Phase-specific hints
// ---------------------------------------------------------------------------
describe("Property 29: Phase-specific hints", () => {
    it("greenfield phase gets scaffold-first hint on plan", () => {
        fc.assert(fc.property(taskTypeArb, (taskType) => {
            const hints = generateHints(taskType, "greenfield", EXPECTED_SEQUENCES.full);
            const tags = hints.map((h) => h.tag);
            expect(tags).toContain("scaffold-first");
        }), { numRuns: 50 });
    });
    it("greenfield phase gets tech-stack-review hint on decide", () => {
        fc.assert(fc.property(taskTypeArb, (taskType) => {
            const hints = generateHints(taskType, "greenfield", EXPECTED_SEQUENCES.full);
            const tags = hints.map((h) => h.tag);
            expect(tags).toContain("tech-stack-review");
        }), { numRuns: 50 });
    });
    it("refactor phase gets behavior-preservation hint on plan", () => {
        fc.assert(fc.property(taskTypeArb, (taskType) => {
            const hints = generateHints(taskType, "refactor", EXPECTED_SEQUENCES.full);
            const tags = hints.map((h) => h.tag);
            expect(tags).toContain("behavior-preservation");
        }), { numRuns: 50 });
    });
    it("refactor phase gets characterization-tests hint on test", () => {
        fc.assert(fc.property(taskTypeArb, (taskType) => {
            const hints = generateHints(taskType, "refactor", EXPECTED_SEQUENCES.full);
            const tags = hints.map((h) => h.tag);
            expect(tags).toContain("characterization-tests");
        }), { numRuns: 50 });
    });
    it("bugfix phase gets reproduce-first hint on build", () => {
        fc.assert(fc.property(taskTypeArb, (taskType) => {
            const hints = generateHints(taskType, "bugfix", EXPECTED_SEQUENCES.full);
            const tags = hints.map((h) => h.tag);
            expect(tags).toContain("reproduce-first");
        }), { numRuns: 50 });
    });
    it("bugfix phase gets root-cause-focus hint on plan", () => {
        fc.assert(fc.property(taskTypeArb, (taskType) => {
            const hints = generateHints(taskType, "bugfix", EXPECTED_SEQUENCES.full);
            const tags = hints.map((h) => h.tag);
            expect(tags).toContain("root-cause-focus");
        }), { numRuns: 50 });
    });
    it("iteration phase gets backward-compat hint on review", () => {
        fc.assert(fc.property(taskTypeArb, (taskType) => {
            const hints = generateHints(taskType, "iteration", EXPECTED_SEQUENCES.full);
            const tags = hints.map((h) => h.tag);
            expect(tags).toContain("backward-compat");
        }), { numRuns: 50 });
    });
});
// ---------------------------------------------------------------------------
// Property 30: Cross-dimension hints
// ---------------------------------------------------------------------------
describe("Property 30: Cross-dimension hints", () => {
    it("frontend + refactor gets snapshot-update hint", () => {
        const hints = generateHints("frontend", "refactor", EXPECTED_SEQUENCES.full);
        const tags = hints.map((h) => h.tag);
        expect(tags).toContain("snapshot-update");
    });
    it("backend + refactor does NOT get snapshot-update hint", () => {
        const hints = generateHints("backend", "refactor", EXPECTED_SEQUENCES.full);
        const tags = hints.map((h) => h.tag);
        expect(tags).not.toContain("snapshot-update");
    });
    it("backend + bugfix gets error-path-audit hint", () => {
        const hints = generateHints("backend", "bugfix", EXPECTED_SEQUENCES.full);
        const tags = hints.map((h) => h.tag);
        expect(tags).toContain("error-path-audit");
    });
    it("frontend + bugfix does NOT get error-path-audit hint", () => {
        const hints = generateHints("frontend", "bugfix", EXPECTED_SEQUENCES.full);
        const tags = hints.map((h) => h.tag);
        expect(tags).not.toContain("error-path-audit");
    });
    it("infra + greenfield gets cost-estimate hint", () => {
        const hints = generateHints("infra", "greenfield", EXPECTED_SEQUENCES.full);
        const tags = hints.map((h) => h.tag);
        expect(tags).toContain("cost-estimate");
    });
    it("infra + iteration does NOT get cost-estimate hint", () => {
        const hints = generateHints("infra", "iteration", EXPECTED_SEQUENCES.full);
        const tags = hints.map((h) => h.tag);
        expect(tags).not.toContain("cost-estimate");
    });
});
// ---------------------------------------------------------------------------
// Property 31: Result structure completeness
// ---------------------------------------------------------------------------
describe("Property 31: Result structure", () => {
    it("classifyTask always returns all fields", () => {
        fc.assert(fc.property(taskSignalsArb, taskTypeArb, projectPhaseArb, (signals, taskType, phase) => {
            const result = classifyTask(signals, undefined, undefined, taskType, phase);
            expect(result).toHaveProperty("tier");
            expect(result).toHaveProperty("reason");
            expect(result).toHaveProperty("commandSequence");
            expect(result).toHaveProperty("taskType");
            expect(result).toHaveProperty("projectPhase");
            expect(result).toHaveProperty("hints");
            expect(result.taskType).toBe(taskType);
            expect(result.projectPhase).toBe(phase);
            expect(Array.isArray(result.hints)).toBe(true);
        }), { numRuns: 200 });
    });
    it("every hint has command, tag, and description", () => {
        fc.assert(fc.property(taskTypeArb, projectPhaseArb, tierArb, (taskType, phase, tier) => {
            const hints = generateHints(taskType, phase, EXPECTED_SEQUENCES[tier]);
            for (const hint of hints) {
                expect(typeof hint.command).toBe("string");
                expect(hint.command.length).toBeGreaterThan(0);
                expect(typeof hint.tag).toBe("string");
                expect(hint.tag.length).toBeGreaterThan(0);
                expect(typeof hint.description).toBe("string");
                expect(hint.description.length).toBeGreaterThan(0);
            }
        }), { numRuns: 200 });
    });
});
// ---------------------------------------------------------------------------
// Property 32: Hint count varies by dimension
// ---------------------------------------------------------------------------
describe("Property 32: Different dimensions produce different hints", () => {
    it("frontend and backend produce different hint sets", () => {
        const frontendHints = generateHints("frontend", "iteration", EXPECTED_SEQUENCES.full);
        const backendHints = generateHints("backend", "iteration", EXPECTED_SEQUENCES.full);
        const frontendTags = new Set(frontendHints.map((h) => h.tag));
        const backendTags = new Set(backendHints.map((h) => h.tag));
        // They should share iteration hints but differ on domain hints
        expect(frontendTags.has("a11y-check")).toBe(true);
        expect(backendTags.has("a11y-check")).toBe(false);
        expect(backendTags.has("api-contract-check")).toBe(true);
        expect(frontendTags.has("api-contract-check")).toBe(false);
    });
    it("refactor and bugfix produce different hint sets", () => {
        const refactorHints = generateHints("fullstack", "refactor", EXPECTED_SEQUENCES.full);
        const bugfixHints = generateHints("fullstack", "bugfix", EXPECTED_SEQUENCES.full);
        const refactorTags = new Set(refactorHints.map((h) => h.tag));
        const bugfixTags = new Set(bugfixHints.map((h) => h.tag));
        expect(refactorTags.has("behavior-preservation")).toBe(true);
        expect(bugfixTags.has("behavior-preservation")).toBe(false);
        expect(bugfixTags.has("reproduce-first")).toBe(true);
        expect(refactorTags.has("reproduce-first")).toBe(false);
    });
});
//# sourceMappingURL=router-dimensions.property.test.js.map