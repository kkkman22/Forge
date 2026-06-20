/**
 * T-07 (Wave 7) — R6.5 guardian contract test (Req6 AC11).
 *
 * ADR-0006 R6.5 (the "guardian philosophy"): Forge MUST NOT pull browser/test
 * dependencies into its own package — MSW / Storybook / Playwright / Cypress /
 * Testing Library / Puppeteer belong in the USER's project (via the recipe),
 * never in Forge's dependencies/devDependencies. This test makes that invariant
 * executable: if anyone ever adds a forbidden dep to package.json, CI fails here.
 *
 * The recipe system (T-06) ships these names as TEMPLATE TEXT in the recipe
 * devDeps snippet files; that text must never be parsed or installed by Forge,
 * and this test guards the actual package.json.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Forbidden test/browser framework packages. Adding any of these to Forge's
 * package.json dependencies or devDependencies breaks R6.5. Extend this list
 * when new test frameworks appear; do NOT remove entries without an ADR.
 */
// biome-ignore lint/suspicious/noExportsInTest: shared forbidden-deps constant so the list is extensible (Req6 AC11 / T-07 REFACTOR)
export const FORBIDDEN_TEST_DEPS: readonly string[] = [
  "msw",
  "storybook",
  "@storybook",
  "playwright",
  "@playwright",
  "cypress",
  "@testing-library",
  "puppeteer",
  "@puppeteer",
];

const ROOT = resolve(import.meta.dirname, "..");
const pkgPath = resolve(ROOT, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function collectDeps(): string[] {
  return [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.devDependencies ?? {})];
}

describe("R6.5 — Forge package.json has zero browser/test deps (Req6 AC11)", () => {
  it("no forbidden test/browser framework is a direct dependency", () => {
    const allDeps = collectDeps();
    const violations: string[] = [];
    for (const dep of allDeps) {
      for (const forbidden of FORBIDDEN_TEST_DEPS) {
        // exact match OR scoped-prefix match (e.g. "@playwright/test", "@testing-library/react")
        if (
          dep === forbidden ||
          dep.startsWith(`${forbidden}/`) ||
          dep.startsWith(`${forbidden}-`)
        ) {
          violations.push(dep);
        }
      }
    }
    expect(violations, `R6.5 violation: Forge pulled test deps ${violations.join(", ")}`).toEqual(
      [],
    );
  });

  it("the forbidden list itself is non-empty (guard against accidental empty-list pass)", () => {
    expect(FORBIDDEN_TEST_DEPS.length).toBeGreaterThan(0);
  });

  it("recipe snippet files are NOT parsed into Forge deps (template text only)", () => {
    // Sanity: the recipe devDeps snippet mentions msw/vitest, but those names
    // must NOT appear in Forge's actual dependencies — proving the recipe is
    // template text, not installed.
    const allDeps = collectDeps();
    expect(allDeps).not.toContain("msw");
    expect(allDeps).not.toContain("@vue/test-utils");
    expect(allDeps).not.toContain("@testing-library/react");
  });
});
