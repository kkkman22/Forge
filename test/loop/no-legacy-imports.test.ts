/**
 * @file No-legacy-imports test — validates that all deleted loop modules
 * have no remaining import references in the codebase.
 *
 * This test FAILS until the legacy modules are deleted (Wave 3).
 */

import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";

/** Files/modules that must NOT be imported anywhere after Wave 3. */
const DELETED_MODULES = [
  "forge-loop-cli",
  "loop-index",
  "loop-error-controller",
  "verify-loop",
  "retry-loop",
  "orchestrator",
  "effect-executor",
  "sdk-driver",
  "sdk-agent-adapter",
  "cli-subprocess-driver",
  "sdk-commit-strategy",
  "sdk-notes-manager",
  "sdk-generic-iteration",
  "sdk-skill-iteration",
  "sdk-driver-types",
  "context-accumulator",
  "completion-reporter",
  "agent-registry",
  "agent-output",
  "agent-adapter",
  "mock-agent-adapter",
  "failure-handler",
  "sleep-preventer",
  "git-transaction",
  "branch-lifecycle",
  "event-log",
  "loop-types",
];

/** Source files that should no longer exist. */
const DELETED_FILES = [
  "src/forge-loop-cli.ts",
  "src/loop-index.ts",
  "src/loop-error-controller.ts",
  "src/verify-loop.ts",
  "src/retry-loop.ts",
  "src/orchestrator.ts",
  "src/effect-executor.ts",
  "src/sdk-driver.ts",
  "src/sdk-agent-adapter.ts",
  "src/cli-subprocess-driver.ts",
  "src/sdk-commit-strategy.ts",
  "src/sdk-notes-manager.ts",
  "src/sdk-generic-iteration.ts",
  "src/sdk-skill-iteration.ts",
  "src/sdk-driver-types.ts",
  "src/context-accumulator.ts",
  "src/completion-reporter.ts",
  "src/agent-registry.ts",
  "src/agent-output.ts",
  "src/agent-adapter.ts",
  "src/mock-agent-adapter.ts",
  "src/failure-handler.ts",
  "src/sleep-preventer.ts",
  "src/git-transaction.ts",
  "src/branch-lifecycle.ts",
  "src/event-log.ts",
  "src/loop-types.ts",
];

/** Test files that should no longer exist. */
const DELETED_TEST_FILES = [
  "test/forge-loop-cli.test.ts",
  "test/verify-loop.test.ts",
  "test/retry-loop.test.ts",
  "test/loop-integration.test.ts",
  "test/loop-skill-integration.test.ts",
  "test/loop-orchestrator.property.test.ts",
  "test/loop-error-controller/loop-error-controller.test.ts",
];

function grepImports(pattern: string, paths: string[]): string[] {
  try {
    // Match actual import/from statements only (not comments or strings)
    const out = execSync(
      `grep -rn "from.*['\\"].*${pattern}" ${paths.join(" ")} --include="*.ts" 2>/dev/null || true`,
      { encoding: "utf-8", cwd: process.cwd() },
    ).trim();
    if (!out) return [];
    return out
      .split("\n")
      .filter(Boolean)
      .filter((l) => !l.includes("no-legacy-imports.test.ts") && !l.includes("src/loop/"));
  } catch {
    return [];
  }
}

describe("Legacy module cleanup", () => {
  describe("deleted source files must not exist", () => {
    for (const file of DELETED_FILES) {
      it(`${file} does not exist`, () => {
        const fs = require("node:fs");
        expect(fs.existsSync(file)).toBe(false);
      });
    }
  });

  describe("deleted test files must not exist", () => {
    for (const file of DELETED_TEST_FILES) {
      it(`${file} does not exist`, () => {
        const fs = require("node:fs");
        expect(fs.existsSync(file)).toBe(false);
      });
    }
  });

  describe("no remaining imports of deleted modules", () => {
    for (const mod of DELETED_MODULES) {
      it(`no import of "${mod}" in src/ or test/`, () => {
        const lines = grepImports(mod, ["src/", "test/"]);
        expect(lines).toEqual([]);
      });
    }
  });

  describe("desktop app removed", () => {
    it("apps/forge-loop-desktop/ does not exist", () => {
      const fs = require("node:fs");
      expect(fs.existsSync("apps/forge-loop-desktop")).toBe(false);
    });
  });

  describe("persistent-loop.sh removed", () => {
    it("scripts/persistent-loop.sh does not exist", () => {
      const fs = require("node:fs");
      expect(fs.existsSync("scripts/persistent-loop.sh")).toBe(false);
    });
  });
});
