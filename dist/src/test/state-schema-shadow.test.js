/**
 * Shadow-migration test for `parseStatusFileGraceful`.
 *
 * Verifies that the schema-driven path (`FORGE_USE_ZOD_PARSER=1`) produces
 * the same `parsed` result as the legacy path for a curated set of real-
 * world inputs. Warnings may differ in detail; the `parsed` field is the
 * observable contract that callers depend on.
 *
 * **Validates: Requirement 2.8** — incremental schema migration parity.
 */
import { afterEach, describe, expect, it } from "vitest";
import { parseStatusFileGraceful } from "../src/state.js";
/**
 * Temporarily flip the FORGE_USE_ZOD_PARSER flag while `fn` runs and
 * always restore it afterwards, so tests cannot leak state.
 */
function withZodParser(fn) {
    const prev = process.env.FORGE_USE_ZOD_PARSER;
    process.env.FORGE_USE_ZOD_PARSER = "1";
    try {
        return fn();
    }
    finally {
        if (prev === undefined) {
            process.env.FORGE_USE_ZOD_PARSER = undefined;
        }
        else {
            process.env.FORGE_USE_ZOD_PARSER = prev;
        }
    }
}
const SAMPLES = [
    {
        name: "empty content",
        content: "",
    },
    {
        name: "no frontmatter",
        content: "# Status\n\nSome body content.\n",
    },
    {
        name: "full frontmatter",
        content: [
            "---",
            'current_task: "implement auth"',
            'tier: "standard"',
            'phase: "build"',
            'task_type: "backend"',
            'project_phase: "iteration"',
            'hints: "use jwt"',
            "assumptions:",
            "  - user table exists",
            "  - bcrypt installed",
            'mode: "interactive"',
            'updated: "2026-05-06T10:00:00Z"',
            "---",
            "",
        ].join("\n"),
    },
    {
        name: "partial frontmatter",
        content: ["---", 'current_task: "refactor router"', 'tier: "light"', "---", ""].join("\n"),
    },
    {
        name: "unknown extra fields pass through",
        content: [
            "---",
            'current_task: "x"',
            'tier: "standard"',
            'phase: "review"',
            'task_type: "fullstack"',
            'project_phase: "iteration"',
            'hints: ""',
            "assumptions: []",
            'mode: "autonomous"',
            'updated: "2026-05-06"',
            'custom_field: "future-use"',
            "---",
            "",
        ].join("\n"),
    },
];
describe("parseStatusFileGraceful — zod-parser shadow migration", () => {
    afterEach(() => {
        // Safety net in case a test skipped withZodParser.
        process.env.FORGE_USE_ZOD_PARSER = undefined;
    });
    for (const sample of SAMPLES) {
        it(`produces the same parsed result for: ${sample.name}`, () => {
            const legacy = parseStatusFileGraceful(sample.content);
            const viaSchema = withZodParser(() => parseStatusFileGraceful(sample.content));
            // Warnings may differ; the contract is the `parsed` payload.
            expect(viaSchema.parsed).toEqual(legacy.parsed);
        });
    }
});
//# sourceMappingURL=state-schema-shadow.test.js.map