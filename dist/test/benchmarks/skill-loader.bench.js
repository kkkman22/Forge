/**
 * skill-loader.loadSkillsFromDir benchmark.
 *
 * BUDGET: p99 < 20 ms, ops/sec > 500 (Requirement 4.2, 4.3)
 *
 * Uses an in-memory `readFile` stub so the benchmark isolates the parsing
 * and validation path from disk I/O.
 */
import { bench, describe } from "vitest";
import { loadSkillsFromDir } from "../../src/skill-loader.js";
const ENTRIES = Array.from({ length: 20 }, (_, i) => `dir-${i}`);
const MANIFEST = JSON.stringify({
    name: "sample-skill",
    version: "1.0.0",
    description: "Sample skill for benchmarking",
    author: "@benchmark",
    forgeVersion: ">=2.0.0",
    phases: ["build", "review"],
});
const READER = (_path) => MANIFEST;
describe("skill-loader.loadSkillsFromDir", () => {
    bench("20 entries", () => {
        loadSkillsFromDir(ENTRIES, READER);
    });
});
//# sourceMappingURL=skill-loader.bench.js.map