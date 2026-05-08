/**
 * Integration test: confirm 3 starter rules are loadable by the loader.
 *
 * **Validates: Requirement R3.3**
 */

import { describe, expect, it } from "vitest";
import { loadAllRules, renderSuggestionSuffix } from "../src/rules-loader.js";

describe("rules-loader starter set [R3.3]", () => {
  it("loads all 3 starter rules from rules/ directory", async () => {
    const rules = await loadAllRules("rules");

    expect(rules.length).toBe(3);

    const names = rules.map((r) => r.name).sort();
    expect(names).toEqual(["no-any-cast", "no-inline-imports", "typescript-exhaustive-switch"]);
  });

  it("all starter rules have alwaysApply=true", async () => {
    const rules = await loadAllRules("rules");

    for (const rule of rules) {
      expect(rule.alwaysApply).toBe(true);
    }
  });

  it("all starter rules have lint_binding", async () => {
    const rules = await loadAllRules("rules");

    for (const rule of rules) {
      expect(rule.lintBinding).not.toBeNull();
      const suffix = renderSuggestionSuffix(rule);
      expect(suffix.length).toBeGreaterThan(0);
    }
  });
});
