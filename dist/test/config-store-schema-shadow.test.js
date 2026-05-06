/**
 * Shadow-migration test for `parseConfigGraceful`.
 *
 * Verifies that the schema-driven path (`FORGE_USE_ZOD_PARSER=1`) produces
 * the same `parsed` result as the legacy path for representative config
 * inputs.
 *
 * **Validates: Requirement 2.8** — incremental schema migration parity.
 */
import { afterEach, describe, expect, it } from "vitest";
import { parseConfigGraceful } from "../src/config-store.js";
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
    { name: "empty content", content: "" },
    { name: "no frontmatter", content: "# Project\n\nBody only.\n" },
    {
        name: "full config",
        content: [
            "---",
            'project: "Forge"',
            "stack:",
            "  - TypeScript",
            "  - Shell",
            "security_level: 2",
            "knowledge_limit: 50",
            "max_parallel_agents: 4",
            "---",
            "",
        ].join("\n"),
    },
    {
        name: "partial config — defaults fill in",
        content: ["---", 'project: "Minimal"', "security_level: 1", "---", ""].join("\n"),
    },
];
describe("parseConfigGraceful — zod-parser shadow migration", () => {
    afterEach(() => {
        process.env.FORGE_USE_ZOD_PARSER = undefined;
    });
    for (const sample of SAMPLES) {
        it(`produces the same parsed result for: ${sample.name}`, () => {
            const legacy = parseConfigGraceful(sample.content);
            const viaSchema = withZodParser(() => parseConfigGraceful(sample.content));
            expect(viaSchema.parsed).toEqual(legacy.parsed);
        });
    }
});
//# sourceMappingURL=config-store-schema-shadow.test.js.map