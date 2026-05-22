/**
 * E2E test — worktree mode.
 *
 * Verifies driver works in worktree mode with forceNoHooks.
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
    objective: "E2E worktree test",
    loopConfig: {
      agent: "claude",
      maxConsecutiveFailures: 3,
      preventSleep: true,
      backoffBaseMs: 60000,
      maxConcurrentLoops: 3,
    },
    limits: { maxIterations: 3 },
    cwd: "/tmp/forge-e2e-test",
    forceNoHooks: true,
    runId: "e2e-worktree",
    runDir: "/tmp/forge-e2e-test/.forge/runs/e2e-worktree/",
    warmQuery: {},
    baseCommit: "abc123",
    notesPath: "/tmp/forge-e2e-test/.forge/runs/e2e-worktree/notes.md",
    branchName: "forge/e2e-worktree-test",
    skillAware: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("E2E worktree mode", () => {
  it("runs in worktree mode and completes", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const agent = new ScriptedAgent([
      { kind: "success", summary: "work in worktree" },
      { kind: "stop", summary: "worktree done" },
    ]);
    const executor = createMockEffectExecutor();
    const config = createConfig();

    const driver = new SdkDriver(config, executor, agent);
    const result = await driver.run();

    expect(result.finalState.status).toBe("aborted");
    expect(result.notesDocument.entries.length).toBeGreaterThanOrEqual(1);
  });
});
