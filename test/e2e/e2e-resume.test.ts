/**
 * E2E test — resume path.
 *
 * Simulates a scenario where the driver can continue after a soft failure
 * (representing resume from a previous run's state).
 *
 * **Validates: Requirement 2 (E2E test suite)**
 */
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  rmSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock("../../src/run-manager.js", () => ({
  RunManager: { persistNotes: vi.fn() },
}));

vi.mock("../../src/context-accumulator.js", () => ({
  buildIterationPrompt: vi.fn(() => "prompt"),
  buildSkillAwarePrompt: vi.fn(() => "skill-prompt"),
  appendEntry: vi.fn((content: string) => content),
  formatNotesDocument: vi.fn(() => ""),
}));

vi.mock("../../src/skill-scheduler.js", () => ({
  determineNextSkill: vi.fn(() => ({ nextPhase: "build", reason: "test" })),
  shouldCommitForPhase: vi.fn(() => true),
}));

vi.mock("../../src/status-file-ext.js", () => ({
  extractLoopFields: vi.fn(() => ({})),
  writeLoopFields: vi.fn((content: string) => content),
  clearLoopFields: vi.fn((content: string) => content),
  updateIterationStatus: vi.fn((content: string) => content),
}));

import type { EffectExecutorInterface } from "../../src/effect-executor.js";
import { SdkDriver, type SdkDriverConfig } from "../../src/sdk-driver.js";
import { ScriptedAgent } from "./helpers/mock-agent.js";

interface MockEffectExecutor extends EffectExecutorInterface {
  executeEffect: Mock<EffectExecutorInterface["executeEffect"]>;
  executeEffects: Mock<EffectExecutorInterface["executeEffects"]>;
}

function createMockEffectExecutor(): MockEffectExecutor {
  return {
    aborted: false,
    stopped: false,
    executeEffect: vi.fn().mockResolvedValue(undefined),
    executeEffects: vi.fn().mockResolvedValue(undefined),
  };
}

function createConfig(overrides?: Partial<SdkDriverConfig>): SdkDriverConfig {
  return {
    objective: "E2E resume test",
    loopConfig: {
      agent: "claude",
      maxConsecutiveFailures: 3,
      preventSleep: true,
      backoffBaseMs: 100,
      maxConcurrentLoops: 3,
    },
    limits: { maxIterations: 5 },
    cwd: "/tmp/forge-e2e-test",
    forceNoHooks: true,
    runId: "e2e-resume",
    runDir: "/tmp/forge-e2e-test/.forge/runs/e2e-resume/",
    warmQuery: {},
    baseCommit: "abc123",
    notesPath: "/tmp/forge-e2e-test/.forge/runs/e2e-resume/notes.md",
    branchName: "forge/e2e-resume-test",
    skillAware: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("E2E resume path", () => {
  it("continues from a previous failure to successful completion", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    // Simulate resume: first iteration fails (legacy), then succeeds
    const agent = new ScriptedAgent([
      { kind: "failure", errorMessage: "stale state from previous run" },
      { kind: "success", summary: "resumed successfully" },
      { kind: "stop", summary: "resume target reached" },
    ]);
    const executor = createMockEffectExecutor();
    const config = createConfig();

    const driver = new SdkDriver(config, executor, agent);
    const result = await driver.run();

    expect(result.finalState.status).toBe("aborted");
    expect(result.finalState.successCount).toBeGreaterThanOrEqual(1);
    expect(result.notesDocument.entries.length).toBeGreaterThanOrEqual(2);
  });

  it("reads StatusFile state on resume and continues", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const readStatusFile = vi.fn().mockReturnValue("---\nloop_iteration: 2\n---\n");
    const writeStatusFile = vi.fn();

    const agent = new ScriptedAgent([
      { kind: "success", summary: "continuing from iteration 2" },
      { kind: "stop", summary: "done" },
    ]);
    const executor = createMockEffectExecutor();
    const config = createConfig({ readStatusFile, writeStatusFile });

    const driver = new SdkDriver(config, executor, agent);
    const result = await driver.run();

    expect(result.finalState.status).toBe("aborted");
    // StatusFile should have been read at least once
    expect(readStatusFile).toHaveBeenCalled();
  });
});
