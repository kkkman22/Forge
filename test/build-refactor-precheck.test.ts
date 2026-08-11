/**
 * Contract tests for Refactor Mode pre-flight checks.
 *
 * Verifies the 7-item pre-flight check gate in refactor-mode.md:
 * 1. Behavioral change mixed in
 * 2. Target lacks test coverage
 * 3. Cross-module (3+ independent modules)
 * 4. Purely stylistic
 * 5. Generated artifacts / third-party code
 * 6. Scope too large (files > 15)
 * 7. Nothing to refactor after scan
 *
 * **Validates: Spec Requirements 1, 6, 8**
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(__dirname, "..");
const REFACTOR_MODE = resolve(ROOT, "skills/tinkerman/lib/build/references/refactor-mode.md");

describe("Refactor Mode pre-flight checks", () => {
  let content: string;

  it("refactor-mode.md file exists", () => {
    content = readFileSync(REFACTOR_MODE, "utf-8");
    expect(content.length).toBeGreaterThan(0);
  });

  it("contains all 7 pre-flight check items", () => {
    content ??= readFileSync(REFACTOR_MODE, "utf-8");
    for (let i = 1; i <= 7; i++) {
      expect(content).toMatch(new RegExp(`\\|\\s*${i}\\s*\\|`));
    }
  });

  it("check 1: behavioral change detection routes to feature/bugfix", () => {
    content ??= readFileSync(REFACTOR_MODE, "utf-8");
    expect(content).toMatch(/behavioral change/i);
    expect(content).toMatch(/feature|bugfix/);
  });

  it("check 2: no test coverage routes to add tests", () => {
    content ??= readFileSync(REFACTOR_MODE, "utf-8");
    expect(content).toMatch(/test coverage/i);
    expect(content).toMatch(/add test/i);
  });

  it("check 3: cross-module routes to spec design", () => {
    content ??= readFileSync(REFACTOR_MODE, "utf-8");
    expect(content).toMatch(/cross-module|3\+/i);
    expect(content).toMatch(/spec/i);
  });

  it("check 4: stylistic routes to lint/formatter config", () => {
    content ??= readFileSync(REFACTOR_MODE, "utf-8");
    expect(content).toMatch(/stylistic/i);
    expect(content).toMatch(/lint|formatter/i);
  });

  it("check 5: generated/third-party routes to fix source", () => {
    content ??= readFileSync(REFACTOR_MODE, "utf-8");
    expect(content).toMatch(/generated|third.party/i);
  });

  it("check 6: scope > 15 files routes to batch", () => {
    content ??= readFileSync(REFACTOR_MODE, "utf-8");
    expect(content).toMatch(/15/);
    expect(content).toMatch(/batch|narrow/i);
  });

  it("check 7: empty scan result is valid exit", () => {
    content ??= readFileSync(REFACTOR_MODE, "utf-8");
    expect(content).toMatch(/zero output|nothing/i);
  });

  it("rejection format is structured with route and reentry condition", () => {
    content ??= readFileSync(REFACTOR_MODE, "utf-8");
    expect(content).toMatch(/命中检查|Route on Hit/);
    expect(content).toMatch(/重入|reentry/i);
  });
});
