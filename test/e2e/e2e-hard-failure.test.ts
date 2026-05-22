/**
 * E2E test — hard failure path.
 *
 * Mock agent returns consecutive failures triggering circuit breaker (maxConsecutiveFailures).
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
    objective: "E2E hard failure test",
    loopConfig: {
      agent: "claude",
      maxConsecutiveFailures: 3,
      preventSleep: true,
      backoffBaseMs: 100,
      maxConcurrentLoops: 3,
    },
    limits: { maxIterations: 10 },
    cwd: "/tmp/forge-e2e-test",
    forceNoHooks: true,
    runId: "e2e-hard-failure",
    runDir: "/tmp/forge-e2e-test/.forge/runs/e2e-hard-failure/",
    warmQuery: {},
    baseCommit: "abc123",
    notesPath: "/tmp/forge-e2e-test/.forge/runs/e2e-hard-failure/notes.md",
    branchName: "forge/e2e-test",
    skillAware: true,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("E2E hard failure path", () => {
  it("aborts after maxConsecutiveFailures reached", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const agent = new ScriptedAgent([{ kind: "failure", errorMessage: "persistent failure" }]);
    const executor = createMockEffectExecutor();
    const config = createConfig();

    const driver = new SdkDriver(config, executor, agent);
    const result = await driver.run();

    // Driver should abort due to max consecutive failures
    expect(result.finalState.status).toBe("aborted");
    expect(result.finalState.failCount).toBeGreaterThanOrEqual(3);
    expect(result.finalState.consecutiveFailures).toBeGreaterThanOrEqual(3);
  });

  it("records failed iterations in notes", async () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const agent = new ScriptedAgent([{ kind: "failure", errorMessage: "fail" }]);
    const executor = createMockEffectExecutor();
    const config = createConfig();

    const driver = new SdkDriver(config, executor, agent);
    const result = await driver.run();

    // All iterations should be recorded
    expect(result.notesDocument.entries.length).toBeGreaterThanOrEqual(3);
    expect(result.finalState.status).toBe("aborted");
  });
});
