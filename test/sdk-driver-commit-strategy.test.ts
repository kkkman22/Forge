/**
 * Unit tests for commit strategy wiring in SdkDriver (skill-aware mode).
 *
 * Verifies that the SdkDriver correctly applies phase-specific commit
 * strategies via `applySkillAwareCommitStrategy()`:
 * - Build success → commit with `forge(build): <summary>`
 * - Plan approved → commit with `forge(plan): <objective> plan approved`
 * - Fix success → commit with `forge(fix): resolve P0/P1 from review`
 * - Review/test completion → no commit effect
 * - Build failure → rollback effect dispatched
 * - Commit failure → hard failure event triggered
 *
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7**
 */
import type { Mock } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AgentInterface,
  AgentResult,
  AgentRunOptions,
  OrchestratorEffect,
  TokenUsage,
} from "../src/loop-types.js";

// Mock RunManager.persistNotes before importing SdkDriver
vi.mock("../src/run-manager.js", () => ({
  RunManager: {
    persistNotes: vi.fn(),
  },
}));

import type { EffectExecutorInterface } from "../src/effect-executor.js";
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

/**
 * Build a StatusFile content string with mode: autonomous and a given phase.
 */
function buildStatusContent(phase?: string): string {
  const lines = ["---", 'mode: "autonomous"', "loop_run_id: test-run-123", "loop_iteration: 1"];
  if (phase) {
    lines.push(`phase: "${phase}"`);
  }
  lines.push("---");
  return lines.join("\n");
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
    run: vi.fn(runImpl ?? (async () => createSkillResult("build", true))),
    close: vi.fn(),
  };
}

/**
 * Create an AgentResult that reports a specific skill phase completion.
 */
function createSkillResult(
  phase: string,
  success: boolean,
  overrides?: Partial<AgentResult>,
): AgentResult {
  return {
    output: {
      success,
      summary: `${phase} phase ${success ? "completed" : "failed"}`,
      key_changes_made: success ? [`${phase} changes`] : [],
      key_learnings: [],
      skill_phase_completed: phase,
    },
    usage: createMockUsage(),
    ...overrides,
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
    readStatusFile: () => buildStatusContent("build"),
    writeStatusFile: vi.fn(),
    readReviewFile: undefined,
    readTestFile: undefined,
    readProgressFile: undefined,
    ...overrides,
  };
}

/**
 * Extract all effects passed to executeEffects across all calls.
 * Returns a flat array of all effects.
 */
function getAllExecutedEffects(executor: MockEffectExecutor): OrchestratorEffect[] {
  const allEffects: OrchestratorEffect[] = [];
  for (const call of executor.executeEffects.mock.calls) {
    const effects = call[0] as OrchestratorEffect[];
    allEffects.push(...effects);
  }
  return allEffects;
}

/**
 * Find commit effects from all executed effects.
 */
function findCommitEffects(
  executor: MockEffectExecutor,
): Array<{ type: "commit"; message: string }> {
  return getAllExecutedEffects(executor).filter(
    (e): e is { type: "commit"; message: string } => e.type === "commit",
  );
}

/**
 * Find rollback effects from all executed effects.
 */
function findRollbackEffects(executor: MockEffectExecutor): Array<{ type: "rollback" }> {
  return getAllExecutedEffects(executor).filter(
    (e): e is { type: "rollback" } => e.type === "rollback",
  );
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Suppress console.warn and console.log during tests
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Build success → commit with forge(build): <summary> (Req 7.1)
// ---------------------------------------------------------------------------

describe("build success triggers commit with phase-specific message", () => {
  it("commits with forge(build): <summary> on build success", async () => {
    const agent = createMockAgent(async () => {
      return createSkillResult("build", true);
    });

    const config = createConfig({
      limits: { maxIterations: 1 },
      readStatusFile: () => buildStatusContent("build"),
    });

    const executor = createMockEffectExecutor();
    const driver = new SdkDriver(config, executor, agent);
    await driver.run();

    const commitEffects = findCommitEffects(executor);
    expect(commitEffects.length).toBeGreaterThanOrEqual(1);

    // Find the commit effect from the iteration (not the start event)
    const buildCommit = commitEffects.find((e) => e.message.startsWith("forge(build):"));
    expect(buildCommit).toBeDefined();
    expect(buildCommit?.message).toContain("build phase completed");
  });
});

// ---------------------------------------------------------------------------
// Plan approved → commit with forge(plan): <objective> plan approved (Req 7.2)
// ---------------------------------------------------------------------------

describe("plan approved triggers commit with plan message", () => {
  it("commits with forge(plan): <objective> plan approved on plan success", async () => {
    const agent = createMockAgent(async () => {
      return createSkillResult("plan", true);
    });

    const config = createConfig({
      limits: { maxIterations: 1 },
      readStatusFile: () => buildStatusContent("plan"),
    });

    const executor = createMockEffectExecutor();
    const driver = new SdkDriver(config, executor, agent);
    await driver.run();

    const commitEffects = findCommitEffects(executor);
    const planCommit = commitEffects.find((e) => e.message.startsWith("forge(plan):"));
    expect(planCommit).toBeDefined();
    expect(planCommit?.message).toBe("forge(plan): Build a login form plan approved");
  });
});

// ---------------------------------------------------------------------------
// Fix success → commit with forge(fix): resolve P0/P1 from review (Req 7.3)
// ---------------------------------------------------------------------------

describe("fix success triggers commit with fix message", () => {
  it("commits with forge(fix): resolve P0/P1 from review on fix success", async () => {
    const agent = createMockAgent(async () => {
      return createSkillResult("fix", true);
    });

    const config = createConfig({
      limits: { maxIterations: 1 },
      readStatusFile: () => buildStatusContent("build"),
    });

    const executor = createMockEffectExecutor();
    const driver = new SdkDriver(config, executor, agent);
    await driver.run();

    const commitEffects = findCommitEffects(executor);
    const fixCommit = commitEffects.find((e) => e.message.startsWith("forge(fix):"));
    expect(fixCommit).toBeDefined();
    expect(fixCommit?.message).toBe("forge(fix): resolve P0/P1 from review");
  });

  it("commits with forge(fix) message for fix-apply phase", async () => {
    const agent = createMockAgent(async () => {
      return createSkillResult("fix-apply", true);
    });

    const config = createConfig({
      limits: { maxIterations: 1 },
      readStatusFile: () => buildStatusContent("build"),
    });

    const executor = createMockEffectExecutor();
    const driver = new SdkDriver(config, executor, agent);
    await driver.run();

    const commitEffects = findCommitEffects(executor);
    const fixCommit = commitEffects.find((e) => e.message.startsWith("forge(fix):"));
    expect(fixCommit).toBeDefined();
    expect(fixCommit?.message).toBe("forge(fix): resolve P0/P1 from review");
  });
});

// ---------------------------------------------------------------------------
// Review/test completion → no commit effect (Req 7.4)
// ---------------------------------------------------------------------------

describe("review/test completion does not trigger commit", () => {
  it("does not produce commit effect for review phase", async () => {
    const agent = createMockAgent(async () => {
      return createSkillResult("review", true);
    });

    const config = createConfig({
      limits: { maxIterations: 1 },
      readStatusFile: () => buildStatusContent("review"),
    });

    const executor = createMockEffectExecutor();
    const driver = new SdkDriver(config, executor, agent);
    await driver.run();

    // After the iteration, there should be no commit effects with forge(review) prefix
    // The commit effect from the orchestrator should have been filtered out
    const commitEffects = findCommitEffects(executor);
    const reviewCommit = commitEffects.find((e) => e.message.includes("review"));
    expect(reviewCommit).toBeUndefined();
  });

  it("does not produce commit effect for test phase", async () => {
    const agent = createMockAgent(async () => {
      return createSkillResult("test", true);
    });

    const config = createConfig({
      limits: { maxIterations: 1 },
      readStatusFile: () => buildStatusContent("test"),
    });

    const executor = createMockEffectExecutor();
    const driver = new SdkDriver(config, executor, agent);
    await driver.run();

    const commitEffects = findCommitEffects(executor);
    const testCommit = commitEffects.find((e) => e.message.includes("test"));
    expect(testCommit).toBeUndefined();
  });

  it("does not produce commit effect for ship phase", async () => {
    const agent = createMockAgent(async () => {
      return createSkillResult("ship", true);
    });

    const config = createConfig({
      limits: { maxIterations: 1 },
      readStatusFile: () => buildStatusContent("ship"),
    });

    const executor = createMockEffectExecutor();
    const driver = new SdkDriver(config, executor, agent);
    await driver.run();

    const commitEffects = findCommitEffects(executor);
    const shipCommit = commitEffects.find((e) => e.message.includes("ship"));
    expect(shipCommit).toBeUndefined();
  });

  it("does not produce commit effect for router phase", async () => {
    const agent = createMockAgent(async () => {
      return createSkillResult("router", true);
    });

    const config = createConfig({
      limits: { maxIterations: 1 },
      readStatusFile: () => buildStatusContent("router"),
    });

    const executor = createMockEffectExecutor();
    const driver = new SdkDriver(config, executor, agent);
    await driver.run();

    const commitEffects = findCommitEffects(executor);
    const routerCommit = commitEffects.find((e) => e.message.includes("router"));
    expect(routerCommit).toBeUndefined();
  });

  it("does not produce commit effect for learn phase", async () => {
    const agent = createMockAgent(async () => {
      return createSkillResult("learn", true);
    });

    const config = createConfig({
      limits: { maxIterations: 1 },
      readStatusFile: () => buildStatusContent("learn"),
    });

    const executor = createMockEffectExecutor();
    const driver = new SdkDriver(config, executor, agent);
    await driver.run();

    const commitEffects = findCommitEffects(executor);
    const learnCommit = commitEffects.find((e) => e.message.includes("learn"));
    expect(learnCommit).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Build failure → rollback effect dispatched (Req 7.5)
// ---------------------------------------------------------------------------

describe("build failure triggers rollback", () => {
  it("dispatches rollback effect when build phase fails", async () => {
    const agent = createMockAgent(async () => {
      return createSkillResult("build", false);
    });

    const config = createConfig({
      limits: { maxIterations: 1 },
      readStatusFile: () => buildStatusContent("build"),
    });

    const executor = createMockEffectExecutor();
    const driver = new SdkDriver(config, executor, agent);
    await driver.run();

    const rollbackEffects = findRollbackEffects(executor);
    expect(rollbackEffects.length).toBeGreaterThanOrEqual(1);
  });

  it("dispatches rollback effect when fix phase fails", async () => {
    const agent = createMockAgent(async () => {
      return createSkillResult("fix", false);
    });

    const config = createConfig({
      limits: { maxIterations: 1 },
      readStatusFile: () => buildStatusContent("build"),
    });

    const executor = createMockEffectExecutor();
    const driver = new SdkDriver(config, executor, agent);
    await driver.run();

    const rollbackEffects = findRollbackEffects(executor);
    expect(rollbackEffects.length).toBeGreaterThanOrEqual(1);
  });

  it("does not produce commit effect when build fails", async () => {
    const agent = createMockAgent(async () => {
      return createSkillResult("build", false);
    });

    const config = createConfig({
      limits: { maxIterations: 1 },
      readStatusFile: () => buildStatusContent("build"),
    });

    const executor = createMockEffectExecutor();
    const driver = new SdkDriver(config, executor, agent);
    await driver.run();

    const commitEffects = findCommitEffects(executor);
    const buildCommit = commitEffects.find((e) => e.message.includes("build"));
    expect(buildCommit).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Commit failure → hard failure event (Req 7.7)
// ---------------------------------------------------------------------------

describe("commit failure triggers hard failure event", () => {
  it("handles commit failure as hard failure with rollback", async () => {
    const agent = createMockAgent(async () => {
      return createSkillResult("build", true);
    });

    const config = createConfig({
      limits: { maxIterations: 1 },
      readStatusFile: () => buildStatusContent("build"),
    });

    const executor = createMockEffectExecutor();

    // Make executeEffects throw on the first call that contains a commit effect,
    // simulating a git commit failure. Subsequent calls (for failure handling) succeed.
    let commitCallSeen = false;
    executor.executeEffects.mockImplementation(async (effects: OrchestratorEffect[]) => {
      const hasCommit = effects.some((e) => e.type === "commit");
      if (hasCommit && !commitCallSeen) {
        commitCallSeen = true;
        throw new Error("git commit failed: unable to write to repository");
      }
      // All other calls succeed (including rollback + backoff from hard failure handling)
    });

    const driver = new SdkDriver(config, executor, agent);
    const result = await driver.run();

    // The commit failure should have been handled as a hard failure.
    // The driver should have dispatched iteration_hard_failure which produces
    // rollback + backoff effects.
    expect(result.finalState.failCount).toBeGreaterThanOrEqual(1);

    // Verify that after the commit failure, rollback was dispatched
    // (from the hard failure handling path)
    const allEffects = getAllExecutedEffects(executor);
    const hasRollback = allEffects.some((e) => e.type === "rollback");
    expect(hasRollback).toBe(true);
  });

  it("records commit failure in notes as effect execution failure", async () => {
    const agent = createMockAgent(async () => {
      return createSkillResult("build", true);
    });

    const config = createConfig({
      limits: { maxIterations: 1 },
      readStatusFile: () => buildStatusContent("build"),
    });

    const executor = createMockEffectExecutor();

    let commitCallSeen = false;
    executor.executeEffects.mockImplementation(async (effects: OrchestratorEffect[]) => {
      const hasCommit = effects.some((e) => e.type === "commit");
      if (hasCommit && !commitCallSeen) {
        commitCallSeen = true;
        throw new Error("git commit failed");
      }
    });

    const driver = new SdkDriver(config, executor, agent);
    const result = await driver.run();

    // Notes should contain an entry about the effect execution failure
    const failureEntry = result.notesDocument.entries.find((e) =>
      e.summary.includes("Effect execution failed"),
    );
    expect(failureEntry).toBeDefined();
    expect(failureEntry?.success).toBe(false);
  });

  it("does not increment commitCount for the failed commit attempt", async () => {
    let iterationCount = 0;
    const agent = createMockAgent(async () => {
      iterationCount++;
      return createSkillResult("build", true);
    });

    // Use maxIterations: 2 so the loop can recover after the hard failure.
    // The first iteration's commit fails → hard failure → backoff → second iteration succeeds.
    const config = createConfig({
      limits: { maxIterations: 2 },
      readStatusFile: () => buildStatusContent("build"),
    });

    const executor = createMockEffectExecutor();

    let commitCallSeen = false;
    executor.executeEffects.mockImplementation(async (effects: OrchestratorEffect[]) => {
      const hasCommit = effects.some((e) => e.type === "commit");
      if (hasCommit && !commitCallSeen) {
        commitCallSeen = true;
        throw new Error("git commit failed");
      }
    });

    const driver = new SdkDriver(config, executor, agent);
    const result = await driver.run();

    // Two iterations ran: first commit failed (hard failure), second succeeded.
    // commitCount should be 1 (only the successful commit), not 2.
    // The failed commit's pre-transition state revert ensures it wasn't counted.
    expect(iterationCount).toBe(2);
    expect(result.commitCount).toBe(1);
    expect(result.finalState.failCount).toBe(1);
    expect(result.finalState.successCount).toBe(1);
  });
});
