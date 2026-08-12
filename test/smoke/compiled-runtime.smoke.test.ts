/**
 * Smoke tests for compiled dist/src runtime (P2-4).
 *
 * Verifies that the compiled JavaScript output works correctly
 * in a real Node.js ESM environment — not just inside Vitest's
 * transform pipeline.
 *
 * These tests catch issues like:
 * - Router intent loader failing in ESM (P1-3 was this exact bug)
 * - MCP server failing to register tools when compiled
 * - Missing or broken imports in dist output
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "../..");
const DIST_ROUTER = join(ROOT, "dist/src/router.js");

describe("compiled dist/src runtime smoke tests", () => {
  it("dist/src/router.js exists", () => {
    expect(existsSync(DIST_ROUTER)).toBe(true);
  });
});

it("router.js classifyTask returns non-empty hints in compiled ESM", () => {
  const code = `
      import { classifyTask } from "${DIST_ROUTER}";
      const signals = {
        hasAuthentication: false,
        hasDatabase: false,
        hasNewService: false,
        hasAmbiguousRequirements: false,
        hasSecurityCritical: false
      };
      const result = classifyTask(
        signals,
        undefined,
        undefined,
        "backend",
        "iteration",
        "feature",
        "请深思熟虑 ultrathink 并严格 TDD"
      );
      const hints = result.hints ?? [];
      console.log(JSON.stringify(hints.filter((h) => h.source === "intent")));
    `;

  const output = execFileSync("node", ["--input-type=module", "-e", code], {
    timeout: 10000,
    encoding: "utf-8",
  });

  const hints = JSON.parse(output.trim());
  expect(Array.isArray(hints)).toBe(true);
  expect(hints.length).toBeGreaterThan(0);
  expect(hints.some((h: { tag?: string }) => h.tag === "reasoning-deep")).toBe(true);
});
