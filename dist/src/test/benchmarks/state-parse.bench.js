/**
 * state.parseStatusFileGraceful benchmark.
 *
 * BUDGET: p99 < 5 ms, ops/sec > 5 000 (Requirement 4.2, 4.3)
 */
import { bench, describe } from "vitest";
import { parseStatusFileGraceful } from "../../src/state.js";
const FULL_FRONTMATTER = [
    "---",
    'current_task: "implement auth"',
    'tier: "standard"',
    'phase: "build"',
    'task_type: "backend"',
    'project_phase: "iteration"',
    'hints: "use bcrypt"',
    "assumptions:",
    "  - user table exists",
    "  - bcrypt installed",
    'mode: "interactive"',
    'updated: "2026-05-06T00:00:00Z"',
    "---",
    "",
    "# Status body",
].join("\n");
const PARTIAL = ["---", 'current_task: "x"', 'tier: "light"', "---", ""].join("\n");
describe("state.parseStatusFileGraceful", () => {
    bench("full frontmatter", () => {
        parseStatusFileGraceful(FULL_FRONTMATTER);
    });
    bench("partial frontmatter", () => {
        parseStatusFileGraceful(PARTIAL);
    });
    bench("empty", () => {
        parseStatusFileGraceful("");
    });
});
//# sourceMappingURL=state-parse.bench.js.map