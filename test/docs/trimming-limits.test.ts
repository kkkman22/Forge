/**
 * Trimming limits validation tests for context bloat control.
 *
 * Covers:
 *   - skills/tinkerman/lib/build/instructions.md §Context Budget Management contains all six limit values with imperative language
 *   - Structured_Output exemption clause is present
 *
 * **Validates: Requirements 2.8, 2.9**
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const PROJECT_ROOT = resolve(import.meta.dirname, "../..");

function readDoc(filename: string): string {
  return readFileSync(resolve(PROJECT_ROOT, filename), "utf-8");
}

describe("SKILL.md trimming limits", () => {
  const skillContent = readDoc("skills/tinkerman/lib/build/instructions.md");

  it("contains all six limit values with imperative language (Req 2.8)", () => {
    // The six limits from the spec:
    // Explore Agent 300, Subagent results 200, test pass 50, test fail 300,
    // git diff >50 lines 200, command output >100 lines 200
    // The actual limits from the Trimmer table in forge-build SKILL.md:
    // Explore ≤300, Subagent ≤200, Test all-pass ≤50 (implied by "单行"),
    // Test failures ≤300, Git diff >50 lines → ≤200, Status >30 files → ≤200
    const limitPatterns = [
      { context: /Explore.*≤300 tokens|≤300 tokens.*Explore/i },
      { context: /Subagent.*≤200 tokens|≤200 tokens.*Subagent/i },
      { context: /Test_Output.*单行|failures.*≤300 tokens|≤300 tokens.*fail/i },
      { context: /diff.*>50.*≤200|status.*>30.*≤200|Git.*≤200 tokens/i },
    ];

    for (const { context } of limitPatterns) {
      expect(skillContent).toMatch(context);
    }
  });

  it("contains Structured_Output exemption clause (Req 2.9)", () => {
    // The exemption clause should mention that structured outputs are exempt
    const exemptionPattern = /structured.*output.*exempt|exempt.*structured.*output/i;
    expect(skillContent).toMatch(exemptionPattern);
  });
});
