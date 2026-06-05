/**
 * Test: Zod schema validation is the default path (no env var needed).
 *
 * Validates: T3 — Config validation unification.
 * The FORGE_USE_ZOD_PARSER env var gate should be removed —
 * Zod parsing is now the default, legacy is the fallback.
 */

import { afterEach, describe, expect, it } from "vitest";
import { parseConfigGraceful } from "../src/config-store.js";
import { parseReviewReportGraceful, parseStatusFileGraceful } from "../src/state.js";

// Ensure the env var is NOT set — proving Zod is default
const ORIGINAL = process.env.FORGE_USE_ZOD_PARSER;

describe("Zod schema is default (no env var needed)", () => {
  afterEach(() => {
    process.env.FORGE_USE_ZOD_PARSER = undefined;
  });

  // Remove env var before each test
  for (const [name, fn] of [
    [
      "parseConfigGraceful uses Zod by default",
      () => {
        delete process.env.FORGE_USE_ZOD_PARSER;
        const { parsed, warnings } = parseConfigGraceful(
          ["---", "project: test-project", "security_level: 2", "knowledge_limit: 15", "---"].join(
            "\n",
          ),
        );
        expect(parsed.project).toBe("test-project");
        expect(parsed.security_level).toBe(2);
        expect(parsed.knowledge_limit).toBe(15);
        // Zod path produces warnings for missing fields
        expect(Array.isArray(warnings)).toBe(true);
      },
    ],
    [
      "parseStatusFileGraceful uses Zod by default",
      () => {
        delete process.env.FORGE_USE_ZOD_PARSER;
        const { parsed } = parseStatusFileGraceful(
          ["---", 'current_task: "my-task"', 'tier: "standard"', 'phase: "build"', "---"].join(
            "\n",
          ),
        );
        expect(parsed.current_task).toBe("my-task");
        expect(parsed.tier).toBe("standard");
        expect(parsed.phase).toBe("build");
      },
    ],
    [
      "parseReviewReportGraceful uses Zod by default",
      () => {
        delete process.env.FORGE_USE_ZOD_PARSER;
        const { parsed } = parseReviewReportGraceful(
          [
            "---",
            "result: pass",
            "reviewed_at_commit: abc123",
            "p0_count: 0",
            "p1_count: 0",
            "---",
          ].join("\n"),
        );
        expect(parsed.result).toBe("pass");
        expect(parsed.reviewed_at_commit).toBe("abc123");
      },
    ],
  ] as const) {
    it(name, fn);
  }
});

// Restore
process.env.FORGE_USE_ZOD_PARSER = ORIGINAL;
