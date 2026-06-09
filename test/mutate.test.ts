/**
 * Mutation Testing Engine tests.
 *
 * Covers:
 *   - Empty enabledPacks → warn exit (no-op)
 *   - Has targetGlobs → generates stryker config
 *   - Mock Stryker JSON output → correct score calculation
 *   - Threshold comparison → correct verdict
 *   - Artifact file written with correct frontmatter
 *   - No mutations found → warn with score 0
 *
 * RED phase: tests written first, implementation follows.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EnabledPacks, PackEntry } from "../src/pack/types.js";

// Mock node:child_process before importing the module under test
const mockExecFileSync = vi.fn();
vi.mock("node:child_process", () => ({
  execFileSync: (...args: unknown[]) => mockExecFileSync(...args),
}));

// Mock node:fs for file writes + report reads
const mockFsWriteFile = vi.fn();
const mockFsMkdir = vi.fn();
const mockFsReadFile = vi.fn();
vi.mock("node:fs", () => ({
  mkdirSync: (...args: unknown[]) => mockFsMkdir(...args),
  writeFileSync: (...args: unknown[]) => mockFsWriteFile(...args),
  readFileSync: (...args: unknown[]) => mockFsReadFile(...args),
}));

// Mock node:path for artifact path construction
vi.mock("node:path", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:path")>();
  return {
    ...actual,
    join: (...args: string[]) => args.join("/"),
  };
});

// Import after mocking
import {
  collectMutationTargets,
  collectTargetGlobs,
  computeMutationScore,
  evaluateMutationVerdict,
  FIRST_PARTY_MUTATION_TARGET_GROUPS,
  generateStrykerConfig,
  runMutation,
} from "../src/mutate.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePackEntry(name: string, globs: string[]): PackEntry {
  return {
    name,
    displayName: name,
    description: `${name} pack`,
    forgeMinVersion: "2.4.0",
    dependsOn: [],
    extends: {},
    featureFlags: { mutation_critical_modules: globs },
    manifestPath: `/packs/${name}/pack.yaml`,
    rootPath: `/packs/${name}`,
  };
}

function makePackEntryNoGlobs(name: string): PackEntry {
  return {
    name,
    displayName: name,
    description: `${name} pack`,
    forgeMinVersion: "2.4.0",
    dependsOn: [],
    extends: {},
    featureFlags: {},
    manifestPath: `/packs/${name}/pack.yaml`,
    rootPath: `/packs/${name}`,
  };
}

function makeEnabledPacks(entries: PackEntry[]): EnabledPacks {
  return {
    order: entries.map((e) => e.name),
    entries,
    customLayerRoot: "/repo/.forge/custom",
  };
}

const strykerJsonOutput = JSON.stringify({
  files: {
    "src/auth.ts": {
      source: "",
      mutants: [
        {
          id: "1",
          location: { start: { line: 1, column: 0 } },
          mutatorName: "ArrowFunction",
          status: "Killed",
          replacement: "()",
        },
        {
          id: "2",
          location: { start: { line: 5, column: 0 } },
          mutatorName: "ConditionalExpression",
          status: "Survived",
          replacement: "true",
        },
        {
          id: "3",
          location: { start: { line: 10, column: 0 } },
          mutatorName: "StringLiteral",
          status: "NoCoverage",
          replacement: '""',
        },
      ],
    },
    "src/user.ts": {
      source: "",
      mutants: [
        {
          id: "4",
          location: { start: { line: 2, column: 0 } },
          mutatorName: "EqualityOperator",
          status: "Killed",
          replacement: "!=",
        },
        {
          id: "5",
          location: { start: { line: 8, column: 0 } },
          mutatorName: "ArrayLiteral",
          status: "RuntimeError",
          replacement: "[]",
        },
      ],
    },
  },
  testFiles: {},
  framework: { name: "vitest", version: "3.2.4" },
  thresholds: { high: 80, low: 60, break: null },
  configFilePath: "stryker.conf.json",
  baseline: "",
  status: "Done",
});

// ---------------------------------------------------------------------------
// collectTargetGlobs
// ---------------------------------------------------------------------------

describe("collectTargetGlobs", () => {
  it("returns empty array when enabledPacks has no entries", () => {
    const enabled = makeEnabledPacks([]);
    const globs = collectTargetGlobs(enabled);
    expect(globs).toEqual([]);
  });

  it("returns empty array when packs have no mutation_critical_modules", () => {
    const enabled = makeEnabledPacks([makePackEntryNoGlobs("pms")]);
    const globs = collectTargetGlobs(enabled);
    expect(globs).toEqual([]);
  });

  it("unions globs from multiple packs", () => {
    const enabled = makeEnabledPacks([
      makePackEntry("pms", ["src/auth/**/*.ts", "src/user.ts"]),
      makePackEntry("ecommerce", ["src/cart/**/*.ts", "src/user.ts"]),
    ]);
    const globs = collectTargetGlobs(enabled);
    expect(globs).toEqual(["src/auth/**/*.ts", "src/user.ts", "src/cart/**/*.ts"]);
  });

  it("deduplicates identical globs across packs", () => {
    const enabled = makeEnabledPacks([
      makePackEntry("pms", ["src/auth.ts", "src/shared.ts"]),
      makePackEntry("ecommerce", ["src/shared.ts", "src/cart.ts"]),
    ]);
    const globs = collectTargetGlobs(enabled);
    expect(globs).toEqual(["src/auth.ts", "src/shared.ts", "src/cart.ts"]);
  });
});

describe("first-party mutation targets", () => {
  it("defines explicit reviewable target groups for critical Forge modules", () => {
    expect(FIRST_PARTY_MUTATION_TARGET_GROUPS.gate_core.mode).toBe("required");
    expect(FIRST_PARTY_MUTATION_TARGET_GROUPS.gate_core.globs).toEqual(
      expect.arrayContaining(["src/ship-gates.ts", "src/ship.ts"]),
    );
    expect(FIRST_PARTY_MUTATION_TARGET_GROUPS.validators.mode).toBe("required");
    expect(FIRST_PARTY_MUTATION_TARGET_GROUPS.workflow_artifacts.mode).toBe("advisory");
  });

  it("collects selected first-party groups before pack targets and deduplicates", () => {
    const enabled = makeEnabledPacks([makePackEntry("pms", ["src/ship.ts", "src/domain.ts"])]);

    const targets = collectMutationTargets(enabled, { targetGroups: ["gate_core"] });

    expect(targets.targetedGlobs[0]).toBe("src/ship-gates.ts");
    expect(targets.targetedGlobs).toContain("src/domain.ts");
    expect(targets.targetedGlobs.filter((glob) => glob === "src/ship.ts")).toHaveLength(1);
    expect(targets.required).toBe(true);
    expect(targets.targetGroups).toEqual(["gate_core"]);
  });
});

describe("tiered mutation verdict", () => {
  it("fails required target groups below threshold", () => {
    expect(
      evaluateMutationVerdict({
        mutationScore: 60,
        threshold: 80,
        required: true,
        targetCount: 2,
      }),
    ).toBe("fail");
  });

  it("warns advisory target groups below threshold", () => {
    expect(
      evaluateMutationVerdict({
        mutationScore: 60,
        threshold: 80,
        required: false,
        targetCount: 2,
      }),
    ).toBe("warn");
  });

  it("warns when no targets are configured instead of passing", () => {
    expect(
      evaluateMutationVerdict({
        mutationScore: 100,
        threshold: 80,
        required: true,
        targetCount: 0,
      }),
    ).toBe("warn");
  });
});

// ---------------------------------------------------------------------------
// computeMutationScore
// ---------------------------------------------------------------------------

describe("computeMutationScore", () => {
  it("computes score = killed / (killed + survived) * 100", () => {
    // 2 killed, 1 survived → 2/(2+1)*100 = 66.67
    const result = computeMutationScore(strykerJsonOutput);
    expect(result.killed).toBe(2);
    expect(result.survived).toBe(1);
    expect(result.noCoverage).toBe(1);
    expect(result.runtimeErrors).toBe(1);
    expect(result.total).toBe(5);
    expect(result.mutationScore).toBeCloseTo(66.67, 1);
  });

  it("returns 0 score when no mutants found", () => {
    const emptyOutput = JSON.stringify({
      files: {},
      testFiles: {},
      framework: { name: "vitest" },
      thresholds: {},
      configFilePath: "stryker.conf.json",
      baseline: "",
      status: "Done",
    });
    const result = computeMutationScore(emptyOutput);
    expect(result.killed).toBe(0);
    expect(result.survived).toBe(0);
    expect(result.noCoverage).toBe(0);
    expect(result.runtimeErrors).toBe(0);
    expect(result.total).toBe(0);
    expect(result.mutationScore).toBe(0);
  });

  it("returns 100 score when all killed and none survived", () => {
    const allKilledOutput = JSON.stringify({
      files: {
        "src/a.ts": {
          source: "",
          mutants: [
            { id: "1", status: "Killed" },
            { id: "2", status: "Killed" },
          ],
        },
      },
      testFiles: {},
      framework: { name: "vitest" },
      thresholds: {},
      configFilePath: "stryker.conf.json",
      baseline: "",
      status: "Done",
    });
    const result = computeMutationScore(allKilledOutput);
    expect(result.killed).toBe(2);
    expect(result.survived).toBe(0);
    expect(result.mutationScore).toBe(100);
  });

  it("excludes noCoverage and runtimeErrors from denominator", () => {
    const mixedOutput = JSON.stringify({
      files: {
        "src/a.ts": {
          source: "",
          mutants: [
            { id: "1", status: "Killed" },
            { id: "2", status: "NoCoverage" },
            { id: "3", status: "RuntimeError" },
          ],
        },
      },
      testFiles: {},
      framework: { name: "vitest" },
      thresholds: {},
      configFilePath: "stryker.conf.json",
      baseline: "",
      status: "Done",
    });
    const result = computeMutationScore(mixedOutput);
    expect(result.killed).toBe(1);
    expect(result.survived).toBe(0);
    expect(result.noCoverage).toBe(1);
    expect(result.runtimeErrors).toBe(1);
    expect(result.mutationScore).toBe(100);
  });

  it("handles TimeoutError as runtimeError", () => {
    const timeoutOutput = JSON.stringify({
      files: {
        "src/a.ts": {
          source: "",
          mutants: [
            { id: "1", status: "Killed" },
            { id: "2", status: "Timeout" },
          ],
        },
      },
      testFiles: {},
      framework: { name: "vitest" },
      thresholds: {},
      configFilePath: "stryker.conf.json",
      baseline: "",
      status: "Done",
    });
    const result = computeMutationScore(timeoutOutput);
    expect(result.killed).toBe(1);
    expect(result.runtimeErrors).toBe(1);
    expect(result.survived).toBe(0);
    expect(result.mutationScore).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// generateStrykerConfig
// ---------------------------------------------------------------------------

describe("generateStrykerConfig", () => {
  it("generates config with correct mutate globs", () => {
    const globs = ["src/auth/**/*.ts", "src/user.ts"];
    const config = generateStrykerConfig(globs, "/tmp/stryker.conf.json");

    expect(config.mutate).toEqual(globs);
    expect(config.reporters).toEqual(["json", "html"]);
    expect(config.jsonReporter.fileName).toContain("mutation-report.json");
  });

  it("includes vitest runner config", () => {
    const config = generateStrykerConfig(["src/a.ts"], "/tmp/stryker.conf.json");
    expect(config.testRunner).toBe("vitest");
  });
});

// ---------------------------------------------------------------------------
// runMutation (integration with mocks)
// ---------------------------------------------------------------------------

describe("runMutation", () => {
  afterEach(() => {
    mockExecFileSync.mockReset();
    mockFsWriteFile.mockReset();
    mockFsMkdir.mockReset();
  });

  it("returns warn with empty globs (no-op)", async () => {
    const enabled = makeEnabledPacks([]);

    const result = await runMutation(enabled, {
      projectRoot: "/repo",
      threshold: 80,
    });

    expect(result.summary.verdict).toBe("warn");
    expect(result.summary.total).toBe(0);
    expect(result.summary.mutationScore).toBe(0);
    expect(result.summary.targetedGlobs).toEqual([]);
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it("returns warn when packs have no mutation_critical_modules", async () => {
    const enabled = makeEnabledPacks([makePackEntryNoGlobs("pms")]);

    const result = await runMutation(enabled, {
      projectRoot: "/repo",
      threshold: 80,
    });

    expect(result.summary.verdict).toBe("warn");
    expect(result.summary.targetedGlobs).toEqual([]);
    expect(mockExecFileSync).not.toHaveBeenCalled();
  });

  it("spawns stryker and returns correct summary", async () => {
    const enabled = makeEnabledPacks([makePackEntry("pms", ["src/auth.ts", "src/user.ts"])]);

    // Mock stryker to output our JSON report
    mockExecFileSync.mockImplementation((cmd: string, args: string[]) => {
      if (cmd === "npx" && args[0] === "stryker" && args.includes("--concurrency")) {
        // Simulate stryker output by writing the report file
        return "";
      }
      return "";
    });

    // Mock the report file read
    mockFsReadFile.mockReturnValue(strykerJsonOutput);

    const result = await runMutation(enabled, {
      projectRoot: "/repo",
      threshold: 80,
    });

    expect(result.summary.targetedGlobs).toEqual(["src/auth.ts", "src/user.ts"]);
    expect(result.summary.killed).toBe(2);
    expect(result.summary.survived).toBe(1);
    expect(result.summary.noCoverage).toBe(1);
    expect(result.summary.runtimeErrors).toBe(1);
    expect(result.summary.mutationScore).toBeCloseTo(66.67, 1);
    expect(result.summary.verdict).toBe("warn"); // 66.67 < 80
    expect(result.summary.threshold).toBe(80);
  });

  it("verdict is pass when score >= threshold", async () => {
    const enabled = makeEnabledPacks([makePackEntry("pms", ["src/auth.ts"])]);

    const allKilledOutput = JSON.stringify({
      files: {
        "src/auth.ts": {
          source: "",
          mutants: [
            { id: "1", status: "Killed" },
            { id: "2", status: "Killed" },
          ],
        },
      },
      testFiles: {},
      framework: { name: "vitest" },
      thresholds: {},
      configFilePath: "stryker.conf.json",
      baseline: "",
      status: "Done",
    });

    mockExecFileSync.mockReturnValue("");
    mockFsReadFile.mockReturnValue(allKilledOutput);

    const result = await runMutation(enabled, {
      projectRoot: "/repo",
      threshold: 80,
    });

    expect(result.summary.mutationScore).toBe(100);
    expect(result.summary.verdict).toBe("pass");
  });

  it("verdict is warn when score < threshold", async () => {
    const enabled = makeEnabledPacks([makePackEntry("pms", ["src/a.ts"])]);

    const halfKilledOutput = JSON.stringify({
      files: {
        "src/a.ts": {
          source: "",
          mutants: [
            { id: "1", status: "Killed" },
            { id: "2", status: "Survived" },
          ],
        },
      },
      testFiles: {},
      framework: { name: "vitest" },
      thresholds: {},
      configFilePath: "stryker.conf.json",
      baseline: "",
      status: "Done",
    });

    mockExecFileSync.mockReturnValue("");
    mockFsReadFile.mockReturnValue(halfKilledOutput);

    const result = await runMutation(enabled, {
      projectRoot: "/repo",
      threshold: 80,
    });

    expect(result.summary.mutationScore).toBe(50);
    expect(result.summary.verdict).toBe("warn");
  });

  it("writes artifact with correct frontmatter", async () => {
    const enabled = makeEnabledPacks([makePackEntry("pms", ["src/a.ts"])]);

    const killedOutput = JSON.stringify({
      files: {
        "src/a.ts": {
          source: "",
          mutants: [{ id: "1", status: "Killed" }],
        },
      },
      testFiles: {},
      framework: { name: "vitest" },
      thresholds: {},
      configFilePath: "stryker.conf.json",
      baseline: "",
      status: "Done",
    });

    mockExecFileSync.mockReturnValue("");
    mockFsReadFile.mockReturnValue(killedOutput);

    const result = await runMutation(enabled, {
      projectRoot: "/repo",
      threshold: 80,
    });

    // Artifact path should be under .forge/mutation/
    expect(result.filePath).toContain(".forge/mutation/");
    expect(result.filePath).toContain(".md");
    expect(result.filePath).toContain("mutation-");

    // Verify write was called (first call is stryker config, second is artifact)
    expect(mockFsMkdir).toHaveBeenCalled();
    expect(mockFsWriteFile).toHaveBeenCalled();

    // Find the artifact write call (the one writing .md content with frontmatter)
    const artifactCall = mockFsWriteFile.mock.calls.find(
      (call: unknown[]) =>
        typeof call[1] === "string" && (call[1] as string).includes("mutationScore:"),
    );
    expect(artifactCall).toBeDefined();
    const writtenContent = artifactCall?.[1] as string;
    expect(writtenContent).toContain("mutationScore:");
    expect(writtenContent).toContain("verdict:");
    expect(writtenContent).toContain("packSource:");
    expect(writtenContent).toContain("targetedGlobs:");
  });

  it("uses default threshold of 80 when not specified", async () => {
    const enabled = makeEnabledPacks([makePackEntry("pms", ["src/a.ts"])]);

    const killedOutput = JSON.stringify({
      files: {
        "src/a.ts": {
          source: "",
          mutants: [{ id: "1", status: "Killed" }],
        },
      },
      testFiles: {},
      framework: { name: "vitest" },
      thresholds: {},
      configFilePath: "stryker.conf.json",
      baseline: "",
      status: "Done",
    });

    mockExecFileSync.mockReturnValue("");
    mockFsReadFile.mockReturnValue(killedOutput);

    const result = await runMutation(enabled, {
      projectRoot: "/repo",
    });

    expect(result.summary.threshold).toBe(80);
  });

  it("records duration in summary", async () => {
    const enabled = makeEnabledPacks([makePackEntry("pms", ["src/a.ts"])]);

    const killedOutput = JSON.stringify({
      files: {
        "src/a.ts": {
          source: "",
          mutants: [{ id: "1", status: "Killed" }],
        },
      },
      testFiles: {},
      framework: { name: "vitest" },
      thresholds: {},
      configFilePath: "stryker.conf.json",
      baseline: "",
      status: "Done",
    });

    mockExecFileSync.mockReturnValue("");
    mockFsReadFile.mockReturnValue(killedOutput);

    const result = await runMutation(enabled, {
      projectRoot: "/repo",
      threshold: 80,
    });

    expect(result.summary.durationMs).toBeGreaterThanOrEqual(0);
  });
});
