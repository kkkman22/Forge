/**
 * Router classifyTask benchmark.
 *
 * BUDGET: p99 < 10 ms, ops/sec > 2 000 (Requirement 4.2, 4.3)
 */
import { bench, describe } from "vitest";
import { classifyTask } from "../../src/router.js";
const lightSignals = {
    filesAffected: 1,
    linesChanged: 15,
    hasExistingSpec: false,
    hasNewService: false,
    hasNewDatabase: false,
    hasAuthChanges: false,
    isVagueRequirement: false,
    hasClearRequirements: true,
};
const fullSignals = {
    filesAffected: 20,
    linesChanged: 500,
    hasExistingSpec: false,
    hasNewService: true,
    hasNewDatabase: true,
    hasAuthChanges: true,
    isVagueRequirement: false,
    hasClearRequirements: false,
};
const BENIGN = "refactor the router module for clarity and add tests";
describe("router.classifyTask", () => {
    bench("light signals, no scan", () => {
        classifyTask(lightSignals);
    });
    bench("full signals, no scan", () => {
        classifyTask(fullSignals);
    });
    bench("standard signals + prompt-defense scan", () => {
        classifyTask(lightSignals, undefined, undefined, "fullstack", "iteration", "feature", BENIGN);
    });
});
//# sourceMappingURL=router-classify.bench.js.map