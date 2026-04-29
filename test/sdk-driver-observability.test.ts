/**
 * Integration unit tests for SdkDriver observability enhancements:
 * - Skill-Aware iteration timing metadata includes `phase` field
 * - Phase switch outputs `skill_phase_transition` log
 * - Degradation detection triggers `performance_degradation` warning
 * - Run end PerformanceBaseline includes extended fields
 *
 * **Validates: Requirements 3.1, 3.3, 3.4, 5.2, 6.1, 6.2**
 */
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing modules under test
// ---------------------------------------------------------------------------

vi.mock("node:fs", () => ({
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(),
  rmSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

vi.mock("../src/run-manager.js", () => ({
  RunManager: {
    persistNotes: vi.fn(),
  },
}));

vi.mock("../src/context-accumulator.js", () => ({
  buildIterationPrompt: vi.fn(() => "generic-prompt"),
  buildSkillAwarePrompt: vi.fn(() => "skill-aware-prompt"),
  appendEntry: vi.fn((content: string) => content),
  formatNotesDocument: vi.fn(() => ""),
}));

// Track phase returned by determineNextSkill across calls
let phaseSequence: string[] = [];
let phaseCallIndex = 0;

vi.mock("../src/skill-scheduler.js", () => ({
  determineNextSkill: vi.fn(() => {
    const phase = phaseSequence[phaseCallIndex] ?? "build";
    phaseCallIndex++;
    return { nextPhase: phase, reason: "test" };
  }),
  shouldCommitForPhase: vi.fn((phase: string, success: boolean) => {
    if (!success) return false;
    return ["build", "plan", "fix", "refactor-apply", "fix-apply"].includes(phase);
  }),
}));

vi.mock("../src/status-file-ext.js", () => ({
  extractLoopFields: vi.fn(() => ({})),
  writeLoopFields: vi.fn((content: string) => content),
  clearLoopFields: vi.fn((content: string) => content),
  updateIterationStatus: vi.fn((content: string) => content),
}));

import type { EffectExecutorInterface } from "../src/effect-executor.js";
import type {
    AgentInterface,
    AgentResult,
    AgentRunOptions,
    TokenUsage,
} from "../src/loop-types.js";
import { SdkDriver, type SdkDriverConfig } from "../src/sdk-driver.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockUsage(overrides?: Partial<TokenUsage>): TokenUsage {
  return {
    inputTokens: 100,
    outputTokens: 50,
    cacheReadTokens: 10,
    cacheCreationTokens: 5,
    ...overrides,
  };
}

function createSuccessResult(overrides?: Partial<AgentResult>): AgentResult {
  return {
    output: {
      success: true,
      summary: "did stuff",
      key_changes_made: ["change"],
      key_learnings: ["learning"],
    },
    usage: createMockUsage(),
    ...overrides,
  };
}

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

function createMockAgent(
  runImpl?: (prompt: string, cwd: string, options?: AgentRunOptions) => Promise<AgentResult>,
): AgentInterface {
  return {
    name: "test-agent",
    run: vi.fn(runImpl ?? (async () => createSuccessResult())),
    close: vi.fn(),
  };
}

function createConfig(overrides?: Partial<SdkDriverConfig>): SdkDriverConfig {
  return {
    objective: "Build a login form",
    loopConfig: {
      agent: "claude",
      maxConsecutiveFailures: 3,
      preventSleep: true,
      backoffBaseMs: 60000,
      maxConcurrentWorktrees: 3,
    },
    limits: { maxIterations: 1 },
    cwd: "/test/repo",
    runId: "test-run-id",
    runDir: "/test/repo/.forge/runs/test-run-id/",
    warmQuery: {},
    baseCommit: "abc123",
    notesPath: "/test/repo/.forge/runs/test-run-id/notes.md",
    branchName: "forge/build-a-login-form",
    skillAware: true,
    ...overrides,
  };
}

/**
 * Collect all log entries emitted by the logger during a driver run.
 * We spy on console.log since the default LogSink outputs via console.log.
 */
function collectLogOutput(spy: ReturnType<typeof vi.spyOn>): string[] {
  return spy.mock.calls.map((call) => String(call[0]));
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  phaseSequence = [];
  phaseCallIndex = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Task 9.4: Skill-Aware iteration timing metadata includes `phase` field
// (Requirements 3.1, 3.3)
// ---------------------------------------------------------------------------

describe("Skill-Aware iteration timing includes phase field", () => {
  it("outputs iteration_timing log with phase in metadata", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    phaseSequence = ["build"];

    const executor = createMockEffectExecutor();
    const agent = createMockAgent();
    const config = createConfig({
      skillAware: true,
      limits: { maxIterations: 1 },
      logSinkConfig: { format: "json", level: "debug" },
    });
    const driver = new SdkDriver(config, executor, agent);

    await driver.run();

    const logs = collectLogOutput(logSpy);
    const timingLog = logs.find((l) => l.includes("iteration_timing"));
    expect(timingLog).toBeDefined();

    // Parse the JSON log entry and verify phase is present
    const parsed = JSON.parse(timingLog!);
    expect(parsed.event).toBe("iteration_timing");
    expect(parsed.metadata).toBeDefined();
    expect(parsed.metadata.phase).toBe("build");
  });
});

// ---------------------------------------------------------------------------
// Task 9.4: Phase switch outputs `skill_phase_transition` log
// (Requirements 3.4)
// ---------------------------------------------------------------------------

describe("Phase switch outputs skill_phase_transition log", () => {
  it("outputs skill_phase_transition when phase changes between iterations", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    // First iteration: "plan", second iteration: "build"
    phaseSequence = ["plan", "build"];

    const executor = createMockEffectExecutor();
    const agent = createMockAgent();
    const config = createConfig({
      skillAware: true,
      limits: { maxIterations: 2 },
      logSinkConfig: { format: "json", level: "debug" },
    });
    const driver = new SdkDriver(config, executor, agent);

    await driver.run();

    const logs = collectLogOutput(logSpy);
    const transitionLog = logs.find((l) => l.includes("skill_phase_transition"));
    expect(transitionLog).toBeDefined();

    const parsed = JSON.parse(transitionLog!);
    expect(parsed.event).toBe("skill_phase_transition");
    expect(parsed.metadata.fromPhase).toBe("plan");
    expect(parsed.metadata.toPhase).toBe("build");
  });

  it("does not output skill_phase_transition when phase stays the same", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    // Both iterations use "build"
    phaseSequence = ["build", "build"];

    const executor = createMockEffectExecutor();
    const agent = createMockAgent();
    const config = createConfig({
      skillAware: true,
      limits: { maxIterations: 2 },
      logSinkConfig: { format: "json", level: "debug" },
    });
    const driver = new SdkDriver(config, executor, agent);

    await driver.run();

    const logs = collectLogOutput(logSpy);
    const transitionLog = logs.find((l) => l.includes("skill_phase_transition"));
    expect(transitionLog).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Task 9.4: Degradation detection triggers `performance_degradation` warning
// (Requirements 5.2)
// ---------------------------------------------------------------------------

describe("Degradation detection triggers performance_degradation warning", () => {
  it("outputs performance_degradation when iteration is anomalously slow", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    phaseSequence = ["build", "build", "build", "build"];

    const executor = createMockEffectExecutor();

    // Use Date.now mock to control iteration durations precisely.
    // Each iteration calls Date.now() 4 times:
    //   iterStartMs, subagentStartMs, agentEndMs, effectEndMs
    // Iterations 1-3: ~100ms each, Iteration 4: ~500ms (>2x avg)
    let dateNowCallCount = 0;
    const dateNowMock = vi.spyOn(Date, "now").mockImplementation(() => {
      dateNowCallCount++;
      const iterationGroup = Math.floor((dateNowCallCount - 1) / 4);
      const posInGroup = (dateNowCallCount - 1) % 4;

      if (iterationGroup < 3) {
        // Fast iterations: 100ms total each
        return 1000000 + iterationGroup * 100 + posInGroup * 30;
      }
      // Slow iteration: 500ms total
      return 1000000 + 300 + posInGroup * 150;
    });

    const agent = createMockAgent();
    const config = createConfig({
      skillAware: true,
      limits: { maxIterations: 4 },
      logSinkConfig: { format: "json", level: "debug" },
    });
    const driver = new SdkDriver(config, executor, agent);

    await driver.run();

    dateNowMock.mockRestore();

    const logs = collectLogOutput(logSpy);
    const degradationLog = logs.find((l) => l.includes("performance_degradation"));
    expect(degradationLog).toBeDefined();

    const parsed = JSON.parse(degradationLog!);
    expect(parsed.event).toBe("performance_degradation");
    expect(parsed.level).toBe("warn");
    expect(parsed.metadata.currentMs).toBeDefined();
    expect(parsed.metadata.rollingAvgMs).toBeDefined();
    expect(parsed.metadata.deviationFactor).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Task 9.4: Run end PerformanceBaseline includes extended fields
// (Requirements 6.1, 6.2)
// ---------------------------------------------------------------------------

describe("Run end PerformanceBaseline includes extended fields", () => {
  it("outputs performance_baseline with subagentCallCount and degradationCount", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    phaseSequence = ["build"];

    const executor = createMockEffectExecutor();
    const agent = createMockAgent();
    const config = createConfig({
      skillAware: true,
      limits: { maxIterations: 1 },
      logSinkConfig: { format: "json", level: "debug" },
    });
    const driver = new SdkDriver(config, executor, agent);

    await driver.run();

    const logs = collectLogOutput(logSpy);
    const baselineLog = logs.find((l) => l.includes("performance_baseline"));
    expect(baselineLog).toBeDefined();

    const parsed = JSON.parse(baselineLog!);
    expect(parsed.event).toBe("performance_baseline");
    // Extended fields should be present in metadata
    expect(parsed.metadata).toBeDefined();
    // subagentCallCount: 1 agent call was made
    expect(parsed.metadata.subagentCallCount).toBe(1);
    // degradationCount: 0 (only 1 iteration, not enough for degradation)
    expect(parsed.metadata.degradationCount).toBe(0);
  });

  it("includes subagent timing stats when subagent calls were made", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    phaseSequence = ["build", "build"];

    const executor = createMockEffectExecutor();
    const agent = createMockAgent();
    const config = createConfig({
      skillAware: true,
      limits: { maxIterations: 2 },
      logSinkConfig: { format: "json", level: "debug" },
    });
    const driver = new SdkDriver(config, executor, agent);

    await driver.run();

    const logs = collectLogOutput(logSpy);
    const baselineLog = logs.find((l) => l.includes("performance_baseline"));
    expect(baselineLog).toBeDefined();

    const parsed = JSON.parse(baselineLog!);
    expect(parsed.metadata.subagentCallCount).toBe(2);
    expect(typeof parsed.metadata.avgSubagentMs).toBe("number");
    expect(typeof parsed.metadata.maxSubagentMs).toBe("number");
    expect(parsed.metadata.degradationCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Task 9.4: Subagent timing log is emitted
// (Requirements 4.1, 4.2)
// ---------------------------------------------------------------------------

describe("Subagent timing log is emitted", () => {
  it("outputs subagent_timing debug log for each agent call", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    phaseSequence = ["build"];

    const executor = createMockEffectExecutor();
    const agent = createMockAgent();
    const config = createConfig({
      skillAware: true,
      limits: { maxIterations: 1 },
      logSinkConfig: { format: "json", level: "debug" },
    });
    const driver = new SdkDriver(config, executor, agent);

    await driver.run();

    const logs = collectLogOutput(logSpy);
    const subagentLog = logs.find((l) => l.includes("subagent_timing"));
    expect(subagentLog).toBeDefined();

    const parsed = JSON.parse(subagentLog!);
    expect(parsed.event).toBe("subagent_timing");
    expect(parsed.level).toBe("debug");
    expect(parsed.metadata.subagentId).toBe("test-agent");
    expect(typeof parsed.metadata.startMs).toBe("number");
    expect(typeof parsed.metadata.endMs).toBe("number");
    expect(typeof parsed.metadata.durationMs).toBe("number");
  });
});
