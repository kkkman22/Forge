/**
 * Shadow-migration test for `parseReviewReportGraceful`.
 *
 * Verifies that the schema-driven path (`FORGE_USE_ZOD_PARSER=1`) produces
 * the same `parsed` result as the legacy path for a curated set of
 * review report inputs.
 *
 * **Validates: Requirement 2.8** — incremental schema migration parity.
 */

import { afterEach, describe, expect, it } from "vitest";
import { parseReviewReportGraceful } from "../src/state.js";

function withZodParser<T>(fn: () => T): T {
  const prev = process.env.FORGE_USE_ZOD_PARSER;
  process.env.FORGE_USE_ZOD_PARSER = "1";
  try {
    return fn();
  } finally {
    if (prev === undefined) {
      process.env.FORGE_USE_ZOD_PARSER = undefined;
    } else {
      process.env.FORGE_USE_ZOD_PARSER = prev;
    }
  }
}

const SAMPLES: ReadonlyArray<{ name: string; content: string }> = [
  { name: "empty content", content: "" },
  { name: "no frontmatter", content: "# Review\n\nBody only.\n" },
  {
    name: "full report",
    content: [
      "---",
      'result: "pass"',
      "p0_count: 0",
      "p1_count: 1",
      "p2_count: 4",
      "p3_count: 10",
      "---",
      "",
    ].join("\n"),
  },
  {
    name: "partial — only result",
    content: ["---", 'result: "fail"', "---", ""].join("\n"),
  },
];

describe("parseReviewReportGraceful — zod-parser shadow migration", () => {
  afterEach(() => {
    process.env.FORGE_USE_ZOD_PARSER = undefined;
  });

  for (const sample of SAMPLES) {
    it(`produces the same parsed result for: ${sample.name}`, () => {
      const legacy = parseReviewReportGraceful(sample.content);
      const viaSchema = withZodParser(() => parseReviewReportGraceful(sample.content));
      expect(viaSchema.parsed).toEqual(legacy.parsed);
    });
  }
});
